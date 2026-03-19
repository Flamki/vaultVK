#!/usr/bin/env bash
set -euo pipefail

echo "[1/6] Configure"
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release

echo "[2/6] Build"
cmake --build build -j"$(nproc)"

echo "[3/6] Unit tests"
ctest --test-dir build --output-on-failure

echo "[4/6] Start cluster"
docker compose up -d --build

cleanup() {
  docker compose down -v || true
}
trap cleanup EXIT

echo "[5/6] Quorum demo"
bash scripts/quorum_demo.sh

echo "[6/6] Done"
docker compose ps

