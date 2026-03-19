$ErrorActionPreference = "Stop"

Write-Host "[1/6] Configure"
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release

Write-Host "[2/6] Build"
cmake --build build --config Release -j 8

Write-Host "[3/6] Unit tests"
ctest --test-dir build -C Release --output-on-failure

Write-Host "[4/6] Start cluster"
docker compose up -d --build

try {
  Write-Host "[5/6] Quorum demo"
  powershell -ExecutionPolicy Bypass -File scripts\quorum_demo.ps1

  Write-Host "[6/6] Done"
  docker compose ps
}
finally {
  docker compose down -v
}

