#!/usr/bin/env bash
set -euo pipefail

echo "This legacy entrypoint is read-only." >&2
if [[ $# == 0 ]]; then set -- status; fi
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/production-topology-preflight.sh" "$@"
