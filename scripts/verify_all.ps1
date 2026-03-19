$ErrorActionPreference = "Stop"

Write-Host "[1/8] Configure"
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release

Write-Host "[2/8] Build"
cmake --build build --config Release -j 8

Write-Host "[3/8] Unit tests"
ctest --test-dir build -C Release --output-on-failure

Write-Host "[4/8] Start full stack"
docker compose up -d --build

try {
  Write-Host "[5/8] Quorum demo"
  powershell -ExecutionPolicy Bypass -File scripts\quorum_demo.ps1

  Write-Host "[6/8] Gateway health"
  $null = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:8000/health" -TimeoutSec 10
  $null = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:8000/api/cluster" -TimeoutSec 10

  Write-Host "[7/8] Frontend health"
  $null = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/" -TimeoutSec 10

  Write-Host "[8/8] Done"
  docker compose ps
}
finally {
  docker compose down -v
}
