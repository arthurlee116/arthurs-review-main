from __future__ import annotations

import argparse
from pathlib import Path

from semantic_service.artifacts import download_locked_models


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", type=Path, default=Path(__file__).with_name("models.lock.json"))
    parser.add_argument("--destination", type=Path, default=Path("/models"))
    args = parser.parse_args()
    download_locked_models(args.lock, args.destination)


if __name__ == "__main__":
    main()
