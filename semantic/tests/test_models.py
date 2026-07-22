from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
import sys

import numpy as np
import pytest

from semantic_service.models import OnnxEmbeddingModel, OnnxRerankerModel, create_session


@dataclass
class FakeEncoding:
    ids: list[int]
    attention_mask: list[int]
    type_ids: list[int]


class FakeTokenizer:
    def __init__(self) -> None:
        self.padding: dict[str, object] | None = None
        self.truncation: dict[str, object] | None = None
        self.last_input: object = None

    def token_to_id(self, token: str) -> int | None:
        return {"<pad>": 7, "<|endoftext|>": 9}.get(token)

    def enable_padding(self, **kwargs: object) -> None:
        self.padding = kwargs

    def enable_truncation(self, **kwargs: object) -> None:
        self.truncation = kwargs

    def encode_batch(self, values: object) -> list[FakeEncoding]:
        self.last_input = values
        return [FakeEncoding([1, 2, 7], [1, 1, 0], [0, 0, 0]), FakeEncoding([1, 3, 4], [1, 1, 1], [0, 0, 0])]


@dataclass
class FakeInput:
    name: str


class FakeSession:
    def __init__(self, output: np.ndarray, inputs: tuple[str, ...] = ("input_ids", "attention_mask")) -> None:
        self.output = output
        self.inputs = inputs
        self.feed: dict[str, np.ndarray] | None = None
        self.output_names: object = None

    def get_inputs(self) -> list[FakeInput]:
        return [FakeInput(name) for name in self.inputs]

    def run(self, output_names: object, feed: dict[str, np.ndarray]) -> list[np.ndarray]:
        self.output_names = output_names
        self.feed = feed
        return [self.output]


def test_session_disables_retained_cpu_arenas_for_bounded_memory(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeOptions:
        def __init__(self) -> None:
            self.config: dict[str, str] = {}

        def add_session_config_entry(self, key: str, value: str) -> None:
            self.config[key] = value

    def inference_session(path: str, *, sess_options: object, providers: list[str]) -> object:
        captured.update(path=path, options=sess_options, providers=providers)
        return object()

    monkeypatch.setitem(
        sys.modules,
        "onnxruntime",
        SimpleNamespace(
            SessionOptions=FakeOptions,
            ExecutionMode=SimpleNamespace(ORT_SEQUENTIAL="sequential"),
            GraphOptimizationLevel=SimpleNamespace(ORT_ENABLE_ALL="all"),
            InferenceSession=inference_session,
        ),
    )

    create_session(Path("/models/embedding/model.onnx"))

    options = captured["options"]
    assert options.enable_cpu_mem_arena is False
    assert options.enable_mem_pattern is False
    assert options.config == {"session.disable_prepacking": "1"}
    assert captured["providers"] == ["CPUExecutionProvider"]


def test_embedding_model_uses_cls_pooling_l2_normalization_and_attention_token_counts() -> None:
    hidden = np.array(
        [
            [[3.0, 4.0, 0.0], [99.0, 99.0, 99.0], [99.0, 99.0, 99.0]],
            [[0.0, 0.0, 2.0], [99.0, 99.0, 99.0], [99.0, 99.0, 99.0]],
        ],
        dtype=np.float32,
    )
    session = FakeSession(hidden)
    tokenizer = FakeTokenizer()
    model = OnnxEmbeddingModel(session=session, tokenizer=tokenizer, dimension=3, maximum_length=512, pad_token="<|endoftext|>")

    vectors, token_counts = model.encode(["one", "two"])

    assert np.allclose(vectors, [[0.6, 0.8, 0.0], [0.0, 0.0, 1.0]])
    assert token_counts == [2, 3]
    assert tokenizer.padding == {"pad_id": 9, "pad_token": "<|endoftext|>"}
    assert tokenizer.truncation == {"max_length": 512}
    assert session.feed is not None
    assert set(session.feed) == {"input_ids", "attention_mask"}
    assert session.feed["input_ids"].dtype == np.int64


def test_embedding_model_rejects_wrong_shapes_zero_norm_and_nonfinite_output() -> None:
    tokenizer = FakeTokenizer()
    for output in (
        np.zeros((2, 3), dtype=np.float32),
        np.zeros((2, 3, 3), dtype=np.float32),
        np.full((2, 3, 3), np.nan, dtype=np.float32),
    ):
        model = OnnxEmbeddingModel(FakeSession(output), tokenizer, dimension=3, maximum_length=512, pad_token="<pad>")
        with pytest.raises(RuntimeError):
            model.encode(["one", "two"])


def test_embedding_model_can_select_a_prepooled_onnx_output() -> None:
    session = FakeSession(np.array([[3.0, 4.0, 0.0], [0.0, 0.0, 2.0]], dtype=np.float32))
    model = OnnxEmbeddingModel(
        session=session,
        tokenizer=FakeTokenizer(),
        dimension=3,
        maximum_length=512,
        pad_token="<pad>",
        output_name="sentence_embedding",
    )

    vectors, token_counts = model.encode(["one", "two"])

    assert np.allclose(vectors, [[0.6, 0.8, 0.0], [0.0, 0.0, 1.0]])
    assert token_counts == [2, 3]
    assert session.output_names == ["sentence_embedding"]


def test_reranker_encodes_query_passage_pairs_and_flattens_logits() -> None:
    tokenizer = FakeTokenizer()
    session = FakeSession(np.array([[0.5], [-1.25]], dtype=np.float32))
    model = OnnxRerankerModel(session=session, tokenizer=tokenizer, maximum_length=512, pad_token="<pad>")

    scores = model.score("query", ["first", "second"])

    assert scores == [0.5, -1.25]
    assert tokenizer.last_input == [("query", "first"), ("query", "second")]
    assert tokenizer.padding == {"pad_id": 7, "pad_token": "<pad>"}
    assert tokenizer.truncation == {"max_length": 512, "strategy": "longest_first"}


def test_reranker_rejects_wrong_or_nonfinite_logits() -> None:
    tokenizer = FakeTokenizer()
    for output in (np.zeros((2, 2), dtype=np.float32), np.array([[0.0], [np.inf]], dtype=np.float32)):
        model = OnnxRerankerModel(FakeSession(output), tokenizer, maximum_length=512, pad_token="<pad>")
        with pytest.raises(RuntimeError):
            model.score("query", ["first", "second"])
