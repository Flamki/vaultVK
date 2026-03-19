# VaultKV

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=18&pause=900&color=36BCF7&center=true&vCenter=true&width=980&lines=VaultKV+Phase+2%3A+C%2B%2B+Storage+Engine+%2B+FastAPI+Gateway+%2B+React+Control+Plane;Live+Cluster+Telemetry%2C+Key+Explorer%2C+Raft+Failover+Demo;One+Command+Run%3A+docker+compose+up+-d+--build" alt="VaultKV animated header" />
</p>

<p align="center">
  <a href="https://github.com/Flamki/vaultVK/actions/workflows/ci.yml"><img src="https://github.com/Flamki/vaultVK/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/C%2B%2B-17-blue.svg" alt="C++17">
  <img src="https://img.shields.io/badge/FastAPI-0.111-009688.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/React-18-61dafb.svg" alt="React">
  <img src="https://img.shields.io/badge/Runtime-Linux%20epoll-2ea44f.svg" alt="Linux epoll">
  <img src="https://img.shields.io/badge/Crypto-AES--256--GCM-informational.svg" alt="AES-256-GCM">
</p>

VaultKV is a distributed key-value system with a complete full-stack control plane:

- C++17 engine (`epoll`, TLV protocol, WAL, MemTable, SSTable, compaction)
- FastAPI gateway (TLV-to-REST + WebSocket metrics stream)
- React dashboard (ops charts, key explorer, failover controls)
- Dockerized 5-service runtime (3 data nodes + gateway + frontend)

## Live Deployment (Current)

- Frontend: [https://vault-vk.vercel.app](https://vault-vk.vercel.app)
- Backend gateway: [https://80.225.207.59.nip.io](https://80.225.207.59.nip.io)
- Health check: [https://80.225.207.59.nip.io/health](https://80.225.207.59.nip.io/health)
- Cluster snapshot: [https://80.225.207.59.nip.io/api/cluster](https://80.225.207.59.nip.io/api/cluster)
- Gateway OpenAPI docs: [https://80.225.207.59.nip.io/docs](https://80.225.207.59.nip.io/docs)

## Documentation Links

- Architecture notes: [ARCHITECTURE.md](ARCHITECTURE.md)
- Vercel deployment: [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)
- Oracle backend deployment: [DEPLOY_ORACLE.md](DEPLOY_ORACLE.md)
- Render trial deployment: [DEPLOY_RENDER.md](DEPLOY_RENDER.md)

## Architecture

```mermaid
flowchart LR
    B[Browser React + Vite] -->|HTTP + WS| G[FastAPI Gateway]
    G -->|TLV TCP| N1[VaultKV Node 1 :7379]
    G -->|TLV TCP| N2[VaultKV Node 2 :7380]
    G -->|TLV TCP| N3[VaultKV Node 3 :7381]
    N1 -->|WAL replication| N2
    N1 -->|WAL replication| N3
    N1 --> D1[(Encrypted WAL/SSTable)]
    N2 --> D2[(Encrypted WAL/SSTable)]
    N3 --> D3[(Encrypted WAL/SSTable)]
```

## Local Full Stack (Docker)

Start:

```bash
docker compose up -d --build
```

Endpoints:

- Frontend: `http://localhost:3000`
- Gateway docs: `http://localhost:8000/docs`
- Cluster snapshot: `http://localhost:8000/api/cluster`

Stop:

```bash
docker compose down -v
```

## Native Engine Build

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
ctest --test-dir build --output-on-failure
```

## Verification Scripts

Linux/macOS:

```bash
bash scripts/verify_all.sh
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify_all.ps1
```

These run configure/build/tests, launch all services, execute quorum replication demo, verify gateway/frontend health, then teardown.

## Deployment Options

### Vercel Frontend + External Backend

- Guide: [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)
- Required Vercel root directory: `frontend`
- Required env vars:
  - `VITE_API_BASE_URL=https://<backend-domain>`
  - `VITE_WS_BASE_URL=wss://<backend-domain>` (optional)

### Oracle Always Free Backend (Recommended)

- Guide: [DEPLOY_ORACLE.md](DEPLOY_ORACLE.md)
- Deployment assets:
  - [`deploy/oracle/docker-compose.oracle.yml`](deploy/oracle/docker-compose.oracle.yml)
  - [`deploy/oracle/Caddyfile`](deploy/oracle/Caddyfile)
  - [`deploy/oracle/.env.example`](deploy/oracle/.env.example)
- Helper scripts:
  - [`scripts/oracle_bootstrap.sh`](scripts/oracle_bootstrap.sh)
  - [`scripts/oracle_deploy.sh`](scripts/oracle_deploy.sh)

### Render Trial Backend

- Guide: [DEPLOY_RENDER.md](DEPLOY_RENDER.md)
- Blueprint: [render.yaml](render.yaml)
- Note: private services are required for nodes (trial credits needed).

## Quorum Demo

Linux/macOS:

```bash
bash scripts/quorum_demo.sh
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\quorum_demo.ps1
```

Python:

```bash
python3 scripts/quorum_demo.py
```

## Live API Smoke Test (Copy/Paste)

Use this against the current backend:

```bash
curl -s https://80.225.207.59.nip.io/health
curl -s -X POST https://80.225.207.59.nip.io/api/keys -H "content-type: application/json" -d "{\"key\":\"hello\",\"value\":\"world\"}"
curl -s "https://80.225.207.59.nip.io/api/keys/hello"
curl -s "https://80.225.207.59.nip.io/api/scan?prefix=h&limit=10"
```

Windows `curl` TLS note:

```powershell
curl.exe --ssl-no-revoke https://80.225.207.59.nip.io/health
```

## Troubleshooting

### `GET` shows `key not found`

This is expected when the key has not been written yet. Use `SET` first, then `GET` the same key.

### Vercel shows `404: NOT_FOUND`

Most common cause: wrong project root.  
Set Vercel project root directory to `frontend`, then redeploy.

### TLS issues on some Windows curl builds

If `curl` fails with revocation checks on Windows Schannel, use:

```powershell
curl.exe --ssl-no-revoke https://<url>
```

## Repository Layout

```text
vaultVK/
  include/vaultkv/          # C++ public headers
  src/                      # C++ core engine
  tests/                    # C++ tests
  gateway/                  # FastAPI TLV bridge
  frontend/                 # React control plane
  nginx/                    # Reverse proxy for API + WS
  scripts/                  # Verification and deployment scripts
  .github/workflows/ci.yml  # Multi-job CI pipeline
```

## CI Pipeline

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

- `native-build`
- `asan`
- `tsan`
- `ubsan`
- `docker-cluster`
- `frontend-build`

## Platform Notes

- C++ server runtime is Linux-first (`epoll`).
- On Windows/macOS, use Docker for complete Phase 2 runtime behavior.
- If host OpenSSL dev libs are missing, host-native build uses development fallback crypto; Linux Docker runtime uses OpenSSL.
