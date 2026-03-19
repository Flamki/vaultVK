$ErrorActionPreference = "Stop"
docker compose up -d --build
Write-Host "VaultKV cluster started:"
Write-Host "  leader   127.0.0.1:7379"
Write-Host "  follower 127.0.0.1:7380"
Write-Host "  follower 127.0.0.1:7381"

