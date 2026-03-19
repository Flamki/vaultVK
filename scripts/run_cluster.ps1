$ErrorActionPreference = "Stop"
docker compose up -d --build
Write-Host "VaultKV full stack started:"
Write-Host "  leader   127.0.0.1:7379"
Write-Host "  follower 127.0.0.1:7380"
Write-Host "  follower 127.0.0.1:7381"
Write-Host "  gateway  http://127.0.0.1:8000/docs"
Write-Host "  frontend http://127.0.0.1:3000"
