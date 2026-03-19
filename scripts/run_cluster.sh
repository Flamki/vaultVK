#!/usr/bin/env bash
set -euo pipefail

docker compose up -d --build
echo "VaultKV full stack started:"
echo "  leader   127.0.0.1:7379"
echo "  follower 127.0.0.1:7380"
echo "  follower 127.0.0.1:7381"
echo "  gateway  http://127.0.0.1:8000/docs"
echo "  frontend http://127.0.0.1:3000"
