from __future__ import annotations

import threading

import pytest

from semantic_service.app import BusyError, RequestError, SemanticApplication, UnavailableError


class FakeEmbeddingModel:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def encode(self, texts: list[str]) -> tuple[list[list[float]], list[int]]:
        self.calls.append(texts)
        return [[1.0, 0.0, 0.0] for _ in texts], [len(text) for text in texts]


class FakeRerankerModel:
    def __init__(self) -> None:
        self.calls: list[tuple[str, list[str]]] = []

    def score(self, query: str, passages: list[str]) -> list[float]:
        self.calls.append((query, passages))
        return [float(len(passage)) for passage in passages]


@pytest.fixture
def application() -> SemanticApplication:
    return SemanticApplication(
        embedding_model=FakeEmbeddingModel(),
        reranker_model=FakeRerankerModel(),
        embedding_identity={"id": "test/embed", "revision": "embed-rev", "dimension": 3},
        reranker_identity={"id": "test/rerank", "revision": "rerank-rev"},
    )


def test_embed_contract_preserves_order_and_identity(application: SemanticApplication) -> None:
    response = application.embed({"kind": "query", "texts": ["中文查询", "english query"]})

    assert response == {
        "model": {"id": "test/embed", "revision": "embed-rev", "dimension": 3},
        "vectors": [[1.0, 0.0, 0.0], [1.0, 0.0, 0.0]],
        "tokenCounts": [4, 13],
    }


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"kind": "other", "texts": ["x"]},
        {"kind": "query", "texts": []},
        {"kind": "query", "texts": [""]},
        {"kind": "query", "texts": ["x"] * 33},
        {"kind": "query", "texts": ["x" * 8193]},
    ],
)
def test_embed_rejects_unbounded_or_malformed_input(application: SemanticApplication, payload: object) -> None:
    with pytest.raises(RequestError):
        application.embed(payload)


def test_rerank_contract_uses_stable_ids(application: SemanticApplication) -> None:
    response = application.rerank(
        {
            "query": "query",
            "candidates": [
                {"id": "article:2", "text": "second passage"},
                {"id": "article:1", "text": "first"},
            ],
        }
    )

    assert response == {
        "model": {"id": "test/rerank", "revision": "rerank-rev"},
        "scores": [
            {"id": "article:2", "score": 14.0},
            {"id": "article:1", "score": 5.0},
        ],
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"query": "", "candidates": [{"id": "1", "text": "x"}]},
        {"query": "q", "candidates": []},
        {"query": "q", "candidates": [{"id": "1", "text": "x"}] * 11},
        {"query": "q", "candidates": [{"id": "1", "text": "x"}, {"id": "1", "text": "y"}]},
        {"query": "q", "candidates": [{"id": "", "text": "x"}]},
    ],
)
def test_rerank_rejects_bad_candidate_sets(application: SemanticApplication, payload: object) -> None:
    with pytest.raises(RequestError):
        application.rerank(payload)


def test_health_reports_both_pinned_models_without_paths(application: SemanticApplication) -> None:
    health = application.health()

    assert health["ok"] is True
    assert health["embedding"] == {"id": "test/embed", "revision": "embed-rev", "dimension": 3}
    assert health["reranker"] == {"id": "test/rerank", "revision": "rerank-rev", "enabled": True}
    assert isinstance(health["rssBytes"], int)
    assert "path" not in str(health).lower()


def test_disabled_reranker_is_not_callable_and_is_explicit_in_health() -> None:
    app = SemanticApplication(
        embedding_model=FakeEmbeddingModel(),
        reranker_model=None,
        embedding_identity={"id": "test/embed", "revision": "embed-rev", "dimension": 3},
        reranker_identity={"id": "test/rerank", "revision": "rerank-rev"},
    )

    assert app.health()["reranker"] == {"id": "test/rerank", "revision": "rerank-rev", "enabled": False}
    with pytest.raises(UnavailableError):
        app.rerank({"query": "query", "candidates": [{"id": "one", "text": "passage"}]})


def test_completed_inference_returns_large_native_allocations_to_the_os(
    application: SemanticApplication, monkeypatch: pytest.MonkeyPatch
) -> None:
    trims: list[bool] = []
    monkeypatch.setattr("semantic_service.app._trim_allocator", lambda: trims.append(True))

    application.embed({"kind": "query", "texts": ["query"]})
    application.rerank({"query": "query", "candidates": [{"id": "one", "text": "passage"}]})

    assert trims == [True, True]


def test_admission_limit_rejects_excess_work_instead_of_growing_without_bound() -> None:
    started = threading.Event()
    release = threading.Event()

    class BlockingEmbedding(FakeEmbeddingModel):
        def encode(self, texts: list[str]) -> tuple[list[list[float]], list[int]]:
            started.set()
            release.wait(timeout=2)
            return super().encode(texts)

    app = SemanticApplication(
        embedding_model=BlockingEmbedding(),
        reranker_model=FakeRerankerModel(),
        embedding_identity={"id": "test/embed", "revision": "embed-rev", "dimension": 3},
        reranker_identity={"id": "test/rerank", "revision": "rerank-rev"},
        maximum_in_flight=1,
    )
    worker = threading.Thread(target=lambda: app.embed({"kind": "query", "texts": ["first"]}))
    worker.start()
    assert started.wait(timeout=1)
    with pytest.raises(BusyError):
        app.embed({"kind": "query", "texts": ["second"]})
    release.set()
    worker.join(timeout=1)
