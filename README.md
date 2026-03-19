# VaultKV

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=18&pause=900&color=36BCF7&center=true&vCenter=true&width=900&lines=Distributed+Encrypted+KV+Store+in+C%2B%2B17;epoll+%2B+WAL+%2B+SSTable+%2B+Compaction+%2B+Quorum+Replication;Built+for+systems-level+storage+engineering+workloads" alt="VaultKV animated header" />
</p>

<p align="center">
  <a href="https://github.com/Flamki/vaultVK/actions/workflows/ci.yml"><img src="https://github.com/Flamki/vaultVK/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/C%2B%2B-17-blue.svg" alt="C++17">
  <img src="https://img.shields.io/badge/Build-CMake-0f6ab4.svg" alt="CMake">
  <img src="https://img.shields.io/badge/Runtime-Linux%20epoll-2ea44f.svg" alt="Linux epoll">
  <img src="https://img.shields.io/badge/Crypto-AES--256--GCM-informational.svg" alt="AES-256-GCM">
</p>

VaultKV is a production-style distributed key-value storage engine focused on low-level systems design:

- `epoll`-driven binary TCP server (TLV wire protocol)
- Encrypted WAL (`mmap` path + integrity checks)
- MemTable + immutable SSTable persistence
- Bloom-indexed lookup and levelled compaction
- Multi-node replication with quorum write behavior

## Quick Start

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
ctest --test-dir build --output-on-failure
```

Run local server:

```bash
./build/vaultkv-server --data-dir ./data --port 7379
```

## Architecture

```mermaid
flowchart LR
    C[Client] -->|TLV over TCP| S[Epoll Server]
    S --> E[Storage Engine]
    E --> W[WAL]
    E --> M[MemTable]
    E --> T[SSTables L0/L1]
    W -->|replay| M
    M -->|flush| T
    T -->|merge| X[Compaction]
    E --> R[Replication Manager]
    R --> N2[Replica Node 2]
    R --> N3[Replica Node 3]
```

## Feature Matrix

| Layer | What is implemented |
|---|---|
| Network | TLV parser, partial-frame buffering, request dispatch |
| Durability | WAL append/replay with CRC validation |
| Crypto | OpenSSL AES path + dev fallback when unavailable |
| Storage | MemTable + SSTable reader/writer + bloom filter |
| Maintenance | Levelled `L0 -> L1` compaction |
| Distributed | Peer fan-out replication + quorum acknowledgment |
| Operations | CLI client, inspector tool, benchmark binary, scripts |

## Docker 3-Node Cluster

```bash
docker compose up -d --build
```

Endpoints:
- Leader: `127.0.0.1:7379`
- Follower: `127.0.0.1:7380`
- Follower: `127.0.0.1:7381`

Run quorum demo:

```bash
bash scripts/quorum_demo.sh
```

PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\quorum_demo.ps1
```

Stop:

```bash
docker compose down -v
```

## Full Verification

Linux/macOS:

```bash
bash scripts/verify_all.sh
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify_all.ps1
```

This runs build, tests, cluster startup, quorum demo, and teardown.

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`

- Native Linux build + test
- Docker cluster smoke test + quorum demo

## Project Layout

```text
vaultkv/
  include/vaultkv/        # public interfaces
  src/                    # core implementation
  tests/                  # unit/integration tests
  tools/                  # CLI and SSTable inspection
  bench/                  # benchmark executable
  scripts/                # automation and demos
```

## Design Choices

- `epoll` for scalable event-driven socket handling
- WAL-before-apply for crash recovery guarantees
- SSTable immutability for predictable compaction mechanics
- Quorum writes for stronger distributed durability semantics

## Platform Notes

- Server runtime is Linux-first (`epoll`).
- On non-Linux hosts, you can still build/test core library and run full distributed demo via Docker.
- If OpenSSL is not installed on the host, a development-only fallback cipher is used outside containers.
