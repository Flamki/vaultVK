# VaultKV Phase 2 Architecture

## System Layers

1. `vaultkv-server` (C++17):
- TLV binary protocol over TCP
- WAL + MemTable + SSTable + compaction
- Optional leader-side replication to peers

2. `gateway` (FastAPI):
- Maintains persistent async TLV connections to each node
- Exposes REST API for key operations and cluster controls
- Streams metrics snapshots over WebSocket every 500ms

3. `frontend` (React + Vite + Tailwind):
- Dashboard with live ops and lag charts
- Key explorer with operation history
- Raft failover demo with node kill/restart actions

4. `nginx`:
- Serves built frontend assets
- Proxies `/api` and `/ws` traffic to FastAPI gateway

## Request Flow

1. Browser issues REST call (for example `POST /api/keys`).
2. FastAPI converts payload to TLV frame and sends to selected node.
3. C++ node replies in TLV (`ACK`, `ERR`, `VAL`, `SCAN_RESULT`).
4. FastAPI normalizes response to JSON.
5. Frontend updates state from response and live WS stream.

## Metrics Flow

1. Gateway `metrics_loop` pings all nodes every 500ms.
2. PING round-trip latency and WAL sequence are tracked per node.
3. Ops/sec and latency percentiles are computed via rolling deques.
4. Snapshot is broadcast to all WebSocket clients.

## Failover Demo Flow

1. UI calls `POST /api/nodes/{node_id}/kill`.
2. Gateway executes `docker stop vaultkv-node{node_id}`.
3. Gateway marks node unhealthy and elects next healthy node.
4. UI event log reports leader transition.
5. Node can be brought back by `POST /api/nodes/{node_id}/restart`.

