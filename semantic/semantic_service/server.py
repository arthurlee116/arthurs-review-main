from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .app import BusyError, RequestError, SemanticApplication, UnavailableError
from .models import OnnxEmbeddingModel, OnnxRerankerModel


MAXIMUM_BODY_BYTES = 256 * 1024


class SemanticHttpServer(ThreadingHTTPServer):
    daemon_threads = True


def _event(**values: object) -> None:
    print(json.dumps(values, ensure_ascii=False, separators=(",", ":")), file=sys.stderr, flush=True)


def make_handler(application: SemanticApplication) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "semantic-search/1"
        sys_version = ""

        def _json(self, status: int, payload: object) -> None:
            body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self.send_header("cache-control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _payload(self) -> object:
            raw_length = self.headers.get("content-length")
            if raw_length is None:
                raise RequestError("Content-Length is required.")
            try:
                length = int(raw_length)
            except ValueError as error:
                raise RequestError("Content-Length must be an integer.") from error
            if length < 0:
                raise RequestError("Content-Length must not be negative.")
            if length > MAXIMUM_BODY_BYTES:
                self.close_connection = True
                raise OverflowError
            raw = self.rfile.read(length)
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError) as error:
                raise RequestError("Request body must be valid JSON.") from error

        def do_GET(self) -> None:  # noqa: N802
            started = time.perf_counter()
            request_id = uuid.uuid4().hex
            if self.path != "/healthz":
                self._json(404, {"error": "Not found."})
                return
            self._json(200, application.health())
            _event(
                requestId=request_id,
                operation="health",
                status=200,
                durationMs=round((time.perf_counter() - started) * 1000, 2),
            )

        def do_POST(self) -> None:  # noqa: N802
            started = time.perf_counter()
            request_id = uuid.uuid4().hex
            batch = 0
            tokens = 0
            operation = "embed" if self.path == "/embed" else "rerank" if self.path == "/rerank" else "unknown"
            if operation == "unknown":
                self._json(404, {"error": "Not found."})
                return
            try:
                payload = self._payload()
                result = application.embed(payload) if operation == "embed" else application.rerank(payload)
                if operation == "embed":
                    token_counts = result.get("tokenCounts", [])
                    batch = len(result.get("vectors", []))
                    tokens = sum(value for value in token_counts if isinstance(value, int))
                else:
                    batch = len(result.get("scores", []))
                self._json(200, result)
                status = 200
            except OverflowError:
                status = 413
                self._json(status, {"error": "Request body is too large."})
            except RequestError as error:
                status = 400
                self._json(status, {"error": str(error)})
            except BusyError:
                status = 503
                self._json(status, {"error": "Semantic inference queue is full."})
            except UnavailableError:
                status = 503
                self._json(status, {"error": "Reranking is disabled."})
            except Exception as error:
                status = 500
                self._json(status, {"error": "Semantic inference failed."})
                _event(requestId=request_id, operation=operation, status=status, errorType=type(error).__name__)
            _event(
                requestId=request_id,
                operation=operation,
                batch=batch,
                tokens=tokens,
                status=status,
                durationMs=round((time.perf_counter() - started) * 1000, 2),
            )

        def log_message(self, format: str, *args: object) -> None:
            return

    return Handler


def create_application(lock_path: Path, model_root: Path, *, rerank_enabled: bool = True) -> SemanticApplication:
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    embedding = lock["embedding"]
    reranker = lock["reranker"]
    embedding_identity = {
        "id": embedding["id"],
        "revision": embedding["revision"],
        "dimension": embedding["dimension"],
    }
    reranker_identity = {"id": reranker["id"], "revision": reranker["revision"]}
    return SemanticApplication(
        embedding_model=OnnxEmbeddingModel.from_directory(
            model_root / "embedding",
            dimension=embedding["dimension"],
            maximum_length=embedding["maximumLength"],
            pad_token=embedding["padToken"],
            output_name=embedding.get("outputName"),
        ),
        reranker_model=(
            OnnxRerankerModel.from_directory(
                model_root / "reranker",
                maximum_length=reranker["maximumLength"],
                pad_token=reranker["padToken"],
            )
            if rerank_enabled
            else None
        ),
        embedding_identity=embedding_identity,
        reranker_identity=reranker_identity,
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument("--models", type=Path, default=Path("/models"))
    parser.add_argument("--lock", type=Path, default=Path("/app/models.lock.json"))
    args = parser.parse_args(argv)
    rerank_value = os.environ.get("SEMANTIC_RERANK_ENABLED", "0").strip()
    if rerank_value not in {"0", "1"}:
        parser.error("SEMANTIC_RERANK_ENABLED must be 0 or 1.")
    application = create_application(args.lock, args.models, rerank_enabled=rerank_value == "1")
    server = SemanticHttpServer((args.host, args.port), make_handler(application))
    _event(operation="startup", status="ready", host=args.host, port=args.port)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
