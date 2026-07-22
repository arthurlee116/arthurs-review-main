from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from semantic_service.artifacts import ArtifactError, download_locked_models, verify_artifact


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def test_verify_artifact_checks_size_and_sha256(tmp_path: Path) -> None:
    artifact = tmp_path / "model.onnx"
    artifact.write_bytes(b"model bytes")

    verify_artifact(artifact, {"size": 11, "sha256": sha256(b"model bytes")})
    with pytest.raises(ArtifactError, match="size"):
        verify_artifact(artifact, {"size": 12, "sha256": sha256(b"model bytes")})
    with pytest.raises(ArtifactError, match="SHA-256"):
        verify_artifact(artifact, {"size": 11, "sha256": "0" * 64})


def test_download_uses_pinned_urls_and_never_keeps_a_bad_partial_file(tmp_path: Path) -> None:
    source = tmp_path / "source.bin"
    source.write_bytes(b"verified content")
    lock = {
        "schemaVersion": 1,
        "embedding": {
            "files": [
                {
                    "path": "model.onnx",
                    "url": source.as_uri(),
                    "size": len(b"verified content"),
                    "sha256": sha256(b"verified content"),
                }
            ]
        },
        "reranker": {"files": []},
    }
    lock_path = tmp_path / "models.lock.json"
    lock_path.write_text(json.dumps(lock), encoding="utf-8")
    destination = tmp_path / "models"

    download_locked_models(lock_path, destination)

    assert (destination / "embedding" / "model.onnx").read_bytes() == b"verified content"
    assert not list(destination.rglob("*.partial"))

    lock["embedding"]["files"][0]["sha256"] = "f" * 64
    lock_path.write_text(json.dumps(lock), encoding="utf-8")
    (destination / "embedding" / "model.onnx").unlink()
    with pytest.raises(ArtifactError):
        download_locked_models(lock_path, destination)
    assert not list(destination.rglob("*.partial"))

