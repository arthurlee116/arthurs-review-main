from __future__ import annotations

import http.client
import json
import threading
from contextlib import contextmanager
from typing import Iterator

import pytest

from semantic_service.app import SemanticApplication
from semantic_service.server import SemanticHttpServer, make_handler


class Embedding:
    def encode(self, texts: list[str]) -> tuple[list[list[float]], list[int]]:
        if texts == ["explode"]:
            raise RuntimeError("private model path /models/embedding")
        return [[1.0, 0.0] for _ in texts], [1 for _ in texts]


class Reranker:
    def score(self, query: str, passages: list[str]) -> list[float]:
        return [float(index) for index, _ in enumerate(passages)]


@contextmanager
def running_server(*, rerank_enabled: bool = True) -> Iterator[tuple[str, int]]:
    app = SemanticApplication(
        embedding_model=Embedding(),
        reranker_model=Reranker() if rerank_enabled else None,
        embedding_identity={"id": "test/embed", "revision": "rev", "dimension": 2},
        reranker_identity={"id": "test/rerank", "revision": "rev"},
    )
    server = SemanticHttpServer(("127.0.0.1", 0), make_handler(app))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield server.server_address
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=1)


def request(address: tuple[str, int], method: str, path: str, body: bytes | None = None) -> tuple[int, dict[str, object]]:
    connection = http.client.HTTPConnection(*address, timeout=2)
    headers = {"content-type": "application/json"} if body is not None else {}
    connection.request(method, path, body=body, headers=headers)
    response = connection.getresponse()
    data = json.loads(response.read())
    connection.close()
    return response.status, data


def test_health_embed_rerank_and_unknown_routes() -> None:
    with running_server() as address:
        status, health = request(address, "GET", "/healthz")
        assert status == 200
        assert health["ok"] is True

        status, embedded = request(address, "POST", "/embed", json.dumps({"kind": "query", "texts": ["hello"]}).encode())
        assert status == 200
        assert embedded["vectors"] == [[1.0, 0.0]]

        status, reranked = request(
            address,
            "POST",
            "/rerank",
            json.dumps({"query": "q", "candidates": [{"id": "1", "text": "one"}]}).encode(),
        )
        assert status == 200
        assert reranked["scores"] == [{"id": "1", "score": 0.0}]

        status, missing = request(address, "GET", "/missing")
        assert status == 404
        assert missing == {"error": "Not found."}


def test_bad_requests_are_bounded_and_internal_errors_are_generic() -> None:
    with running_server() as address:
        status, invalid = request(address, "POST", "/embed", b"not-json")
        assert status == 400
        assert invalid == {"error": "Request body must be valid JSON."}

        status, too_large = request(address, "POST", "/embed", b"x" * (256 * 1024 + 1))
        assert status == 413
        assert too_large == {"error": "Request body is too large."}

        status, failed = request(address, "POST", "/embed", json.dumps({"kind": "query", "texts": ["explode"]}).encode())
        assert status == 500
        assert failed == {"error": "Semantic inference failed."}
        assert "/models" not in str(failed)


def test_disabled_reranker_returns_a_bounded_service_unavailable_response() -> None:
    with running_server(rerank_enabled=False) as address:
        status, response = request(
            address,
            "POST",
            "/rerank",
            json.dumps({"query": "q", "candidates": [{"id": "1", "text": "one"}]}).encode(),
        )

        assert status == 503
        assert response == {"error": "Reranking is disabled."}


def test_request_logs_have_counts_and_ids_but_never_text(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[dict[str, object]] = []
    monkeypatch.setattr("semantic_service.server._event", lambda **values: events.append(values))

    with running_server() as address:
        status, _response = request(
            address,
            "POST",
            "/embed",
            json.dumps({"kind": "query", "texts": ["private-query-text"]}).encode(),
        )

    assert status == 200
    event = next(value for value in events if value.get("operation") == "embed")
    assert event["batch"] == 1
    assert event["tokens"] == 1
    assert isinstance(event["requestId"], str) and len(event["requestId"]) == 32
    assert "private-query-text" not in str(events)
