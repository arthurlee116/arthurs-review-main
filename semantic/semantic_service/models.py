from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

import numpy as np


def _session_inputs(session: Any) -> set[str]:
    return {value.name for value in session.get_inputs()}


def _feeds(session: Any, encodings: Sequence[Any]) -> tuple[dict[str, np.ndarray], list[int]]:
    input_ids = np.asarray([encoding.ids for encoding in encodings], dtype=np.int64)
    attention_mask = np.asarray([encoding.attention_mask for encoding in encodings], dtype=np.int64)
    available = _session_inputs(session)
    feeds: dict[str, np.ndarray] = {}
    if "input_ids" in available:
        feeds["input_ids"] = input_ids
    if "attention_mask" in available:
        feeds["attention_mask"] = attention_mask
    if "token_type_ids" in available:
        feeds["token_type_ids"] = np.asarray([encoding.type_ids for encoding in encodings], dtype=np.int64)
    missing = available - feeds.keys()
    if missing:
        raise RuntimeError(f"Unsupported ONNX model inputs: {sorted(missing)}")
    return feeds, attention_mask.sum(axis=1).astype(int).tolist()


def create_session(model_path: Path) -> Any:
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    options.add_session_config_entry("session.disable_prepacking", "1")
    return ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])


def load_tokenizer(tokenizer_path: Path) -> Any:
    from tokenizers import Tokenizer

    return Tokenizer.from_file(str(tokenizer_path))


class OnnxEmbeddingModel:
    def __init__(
        self,
        session: Any,
        tokenizer: Any,
        dimension: int,
        maximum_length: int,
        pad_token: str,
        output_name: str | None = None,
    ) -> None:
        if dimension <= 0 or maximum_length <= 0:
            raise ValueError("Embedding dimension and maximum length must be positive.")
        pad_id = tokenizer.token_to_id(pad_token)
        if pad_id is None:
            raise RuntimeError(f"Embedding pad token is missing from tokenizer: {pad_token}")
        tokenizer.enable_padding(pad_id=pad_id, pad_token=pad_token)
        tokenizer.enable_truncation(max_length=maximum_length)
        self.session = session
        self.tokenizer = tokenizer
        self.dimension = dimension
        self.output_name = output_name

    @classmethod
    def from_directory(
        cls,
        directory: Path,
        *,
        dimension: int,
        maximum_length: int,
        pad_token: str,
        output_name: str | None = None,
    ) -> "OnnxEmbeddingModel":
        return cls(
            session=create_session(directory / "model.onnx"),
            tokenizer=load_tokenizer(directory / "tokenizer.json"),
            dimension=dimension,
            maximum_length=maximum_length,
            pad_token=pad_token,
            output_name=output_name,
        )

    def encode(self, texts: list[str]) -> tuple[list[list[float]], list[int]]:
        encodings = self.tokenizer.encode_batch(texts)
        feeds, token_counts = _feeds(self.session, encodings)
        output_names = [self.output_name] if self.output_name else None
        output = np.asarray(self.session.run(output_names, feeds)[0], dtype=np.float32)
        if self.output_name:
            if output.shape != (len(texts), self.dimension):
                raise RuntimeError(f"Unexpected prepooled embedding ONNX output shape: {output.shape}")
            pooled = output
        else:
            if output.ndim != 3 or output.shape[0] != len(texts) or output.shape[2] != self.dimension:
                raise RuntimeError(f"Unexpected embedding ONNX output shape: {output.shape}")
            pooled = output[:, 0, :]
        if not np.isfinite(pooled).all():
            raise RuntimeError("Embedding ONNX output contains non-finite values.")
        norms = np.linalg.norm(pooled, axis=1, keepdims=True)
        if not np.isfinite(norms).all() or np.any(norms <= 0):
            raise RuntimeError("Embedding ONNX output has an invalid norm.")
        normalized = pooled / norms
        return normalized.astype(np.float32).tolist(), token_counts


class OnnxRerankerModel:
    def __init__(self, session: Any, tokenizer: Any, maximum_length: int, pad_token: str) -> None:
        if maximum_length <= 0:
            raise ValueError("Reranker maximum length must be positive.")
        pad_id = tokenizer.token_to_id(pad_token)
        if pad_id is None:
            raise RuntimeError(f"Reranker pad token is missing from tokenizer: {pad_token}")
        tokenizer.enable_padding(pad_id=pad_id, pad_token=pad_token)
        tokenizer.enable_truncation(max_length=maximum_length, strategy="longest_first")
        self.session = session
        self.tokenizer = tokenizer

    @classmethod
    def from_directory(cls, directory: Path, *, maximum_length: int, pad_token: str) -> "OnnxRerankerModel":
        return cls(
            session=create_session(directory / "model.onnx"),
            tokenizer=load_tokenizer(directory / "tokenizer.json"),
            maximum_length=maximum_length,
            pad_token=pad_token,
        )

    def score(self, query: str, passages: list[str]) -> list[float]:
        encodings = self.tokenizer.encode_batch([(query, passage) for passage in passages])
        feeds, _token_counts = _feeds(self.session, encodings)
        output = np.asarray(self.session.run(None, feeds)[0], dtype=np.float32)
        if output.shape != (len(passages), 1) or not np.isfinite(output).all():
            raise RuntimeError(f"Unexpected reranker ONNX output shape or values: {output.shape}")
        return output[:, 0].astype(float).tolist()
