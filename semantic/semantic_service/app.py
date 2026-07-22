from __future__ import annotations

import contextlib
import ctypes
import resource
import sys
import threading
from collections.abc import Iterator
from typing import Any, Protocol


class EmbeddingModel(Protocol):
    def encode(self, texts: list[str]) -> tuple[list[list[float]], list[int]]: ...


class RerankerModel(Protocol):
    def score(self, query: str, passages: list[str]) -> list[float]: ...


class RequestError(ValueError):
    pass


class BusyError(RuntimeError):
    pass


class UnavailableError(RuntimeError):
    pass


def _trim_allocator() -> None:
    if not sys.platform.startswith("linux"):
        return
    try:
        ctypes.CDLL(None).malloc_trim(0)
    except AttributeError:
        return


def _bounded_text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 8_192:
        raise RequestError(f"{label} must contain 1 to 8192 code points.")
    return value


def _rss_bytes() -> int:
    maximum = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(maximum if sys.platform == "darwin" else maximum * 1024)


class SemanticApplication:
    def __init__(
        self,
        *,
        embedding_model: EmbeddingModel,
        reranker_model: RerankerModel | None,
        embedding_identity: dict[str, object],
        reranker_identity: dict[str, object],
        maximum_in_flight: int = 4,
    ) -> None:
        if maximum_in_flight <= 0:
            raise ValueError("maximum_in_flight must be positive.")
        self.embedding_model = embedding_model
        self.reranker_model = reranker_model
        self.embedding_identity = dict(embedding_identity)
        self.reranker_identity = dict(reranker_identity)
        self._admission = threading.BoundedSemaphore(maximum_in_flight)
        self._inference = threading.Lock()

    @contextlib.contextmanager
    def _inference_slot(self) -> Iterator[None]:
        if not self._admission.acquire(blocking=False):
            raise BusyError("Semantic inference queue is full.")
        try:
            with self._inference:
                yield
        finally:
            self._admission.release()

    def health(self) -> dict[str, object]:
        return {
            "ok": True,
            "embedding": dict(self.embedding_identity),
            "reranker": {**self.reranker_identity, "enabled": self.reranker_model is not None},
            "rssBytes": _rss_bytes(),
        }

    def embed(self, payload: object) -> dict[str, object]:
        if not isinstance(payload, dict):
            raise RequestError("Embedding request must be a JSON object.")
        kind = payload.get("kind")
        texts = payload.get("texts")
        if kind not in ("query", "document") or not isinstance(texts, list) or not 1 <= len(texts) <= 32:
            raise RequestError("Embedding request requires kind and 1 to 32 texts.")
        bounded = [_bounded_text(value, "Embedding text") for value in texts]
        with self._inference_slot():
            try:
                vectors, token_counts = self.embedding_model.encode(bounded)
            finally:
                _trim_allocator()
        if len(vectors) != len(bounded) or len(token_counts) != len(bounded):
            raise RuntimeError("Embedding model returned an incomplete batch.")
        return {
            "model": dict(self.embedding_identity),
            "vectors": vectors,
            "tokenCounts": token_counts,
        }

    def rerank(self, payload: object) -> dict[str, object]:
        if not isinstance(payload, dict):
            raise RequestError("Rerank request must be a JSON object.")
        query = _bounded_text(payload.get("query"), "Rerank query")
        candidates = payload.get("candidates")
        if not isinstance(candidates, list) or not 1 <= len(candidates) <= 10:
            raise RequestError("Rerank request requires 1 to 10 candidates.")
        ids: list[str] = []
        passages: list[str] = []
        for candidate in candidates:
            if not isinstance(candidate, dict):
                raise RequestError("Each rerank candidate must be an object.")
            ids.append(_bounded_text(candidate.get("id"), "Candidate id"))
            passages.append(_bounded_text(candidate.get("text"), "Candidate text"))
        if len(set(ids)) != len(ids):
            raise RequestError("Candidate ids must be unique.")
        if self.reranker_model is None:
            raise UnavailableError("Reranking is disabled for this service instance.")
        with self._inference_slot():
            try:
                scores = self.reranker_model.score(query, passages)
            finally:
                _trim_allocator()
        if len(scores) != len(ids):
            raise RuntimeError("Reranker returned an incomplete batch.")
        return {
            "model": dict(self.reranker_identity),
            "scores": [{"id": candidate_id, "score": score} for candidate_id, score in zip(ids, scores, strict=True)],
        }
