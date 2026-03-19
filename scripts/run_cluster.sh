#!/usr/bin/env bash
set -euo pipefail

docker compose up -d --build
echo "VaultKV cluster started:"
echo "  leader   127.0.0.1:7379"
echo "  follower 127.0.0.1:7380"
echo "  follower 127.0.0.1:7381"

