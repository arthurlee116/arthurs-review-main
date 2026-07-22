from __future__ import annotations

import hashlib
import json
import os
import shutil
import urllib.request
from pathlib import Path
from typing import Any


class ArtifactError(RuntimeError):
    pass


def verify_artifact(path: Path, artifact: dict[str, Any]) -> None:
    expected_size = artifact.get("size")
    expected_sha256 = artifact.get("sha256")
    if not isinstance(expected_size, int) or expected_size < 0:
        raise ArtifactError("Artifact lock has an invalid size.")
    if not isinstance(expected_sha256, str) or len(expected_sha256) != 64:
        raise ArtifactError("Artifact lock has an invalid SHA-256.")
    actual_size = path.stat().st_size
    if actual_size != expected_size:
        raise ArtifactError(f"Artifact size mismatch for {path.name}: expected {expected_size}, received {actual_size}.")
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    if digest.hexdigest() != expected_sha256:
        raise ArtifactError(f"Artifact SHA-256 mismatch for {path.name}.")


def _safe_target(root: Path, relative: object) -> Path:
    if not isinstance(relative, str) or not relative:
        raise ArtifactError("Artifact path must be a non-empty string.")
    target = (root / relative).resolve()
    resolved_root = root.resolve()
    if target == resolved_root or resolved_root not in target.parents:
        raise ArtifactError("Artifact path escapes its model directory.")
    return target


def download_locked_models(lock_path: Path, destination: Path) -> None:
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    if lock.get("schemaVersion") != 1:
        raise ArtifactError("Unsupported model lock schema.")
    for model_name in ("embedding", "reranker"):
        model = lock.get(model_name)
        if not isinstance(model, dict) or not isinstance(model.get("files"), list):
            raise ArtifactError(f"Model lock is missing {model_name} files.")
        root = destination / model_name
        root.mkdir(parents=True, exist_ok=True)
        for artifact in model["files"]:
            if not isinstance(artifact, dict) or not isinstance(artifact.get("url"), str):
                raise ArtifactError("Artifact lock entry is malformed.")
            target = _safe_target(root, artifact.get("path"))
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                try:
                    verify_artifact(target, artifact)
                    continue
                except ArtifactError:
                    target.unlink()
            partial = target.with_name(f"{target.name}.partial")
            partial.unlink(missing_ok=True)
            try:
                with urllib.request.urlopen(artifact["url"], timeout=120) as response, partial.open("wb") as output:
                    shutil.copyfileobj(response, output, length=1024 * 1024)
                    output.flush()
                    os.fsync(output.fileno())
                verify_artifact(partial, artifact)
                os.replace(partial, target)
            except Exception as error:
                partial.unlink(missing_ok=True)
                if isinstance(error, ArtifactError):
                    raise
                raise ArtifactError(f"Failed to download locked artifact {artifact.get('path')}.") from error

