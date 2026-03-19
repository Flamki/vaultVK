#!/usr/bin/env bash
set -euo pipefail

echo "[1/8] Configure"
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release

echo "[2/8] Build"
cmake --build build -j"$(nproc)"

echo "[3/8] Unit tests"
ctest --test-dir build --output-on-failure

echo "[4/8] Start full stack"
docker compose up -d --build

cleanup() {
  docker compose down -v || true
}
trap cleanup EXIT

echo "[5/8] Quorum demo"
bash scripts/quorum_demo.sh

echo "[6/8] Gateway health"
curl -sf http://localhost:8000/health >/dev/null
curl -sf http://localhost:8000/api/cluster >/dev/null

echo "[7/8] Frontend health"
curl -sf http://localhost:3000 >/dev/null

echo "[8/8] Done"
docker compose ps
