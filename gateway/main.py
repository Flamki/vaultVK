from __future__ import annotations

import asyncio
import json
import os
import subprocess
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import docker
from docker.errors import DockerException, NotFound

from cluster import ClusterManager
from metrics import MetricsCollector


def parse_nodes_env(raw: str | None) -> list[tuple[int, str, int]]:
    if not raw:
        return [
            (1, "vaultkv-node1", 7379),
            (2, "vaultkv-node2", 7380),
            (3, "vaultkv-node3", 7381),
        ]
    out: list[tuple[int, str, int]] = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        left, right = chunk.split("@", 1)
        host, port_s = right.rsplit(":", 1)
        out.append((int(left), host, int(port_s)))
    return out


NODES = parse_nodes_env(os.getenv("VAULTKV_NODES"))


def parse_cors_origins(raw: str | None) -> list[str]:
    if not raw:
        return ["*"]
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or ["*"]


CORS_ORIGINS = parse_cors_origins(os.getenv("VAULTKV_CORS_ORIGINS"))
DISABLE_DOCKER_CONTROL = os.getenv("VAULTKV_DISABLE_DOCKER_CONTROL", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.docker = None
    try:
        app.state.docker = docker.from_env()
    except DockerException:
        app.state.docker = None
    await app.state.cluster.startup()
    task = asyncio.create_task(metrics_loop(app))
    try:
        yield
    finally:
        task.cancel()
        await app.state.cluster.shutdown()
        if app.state.docker is not None:
            try:
                app.state.docker.close()
            except Exception:
                pass


app = FastAPI(title="VaultKV Gateway", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.state.cluster = ClusterManager(NODES)
app.state.metrics = MetricsCollector(window=60)
app.state.ws_clients: list[WebSocket] = []


class SetRequest(BaseModel):
    key: str = Field(min_length=1)
    value: str
    ttl_seconds: int = 0


@app.get("/health")
async def health():
    return {"ok": True, "service": "gateway"}


@app.post("/api/keys", summary="SET key/value")
async def set_key(req: SetRequest):
    t0 = time.perf_counter()
    try:
        result = await app.state.cluster.set(req.key, req.value)
    except Exception as exc:
        raise HTTPException(503, f"write failed: {exc}") from exc
    latency_ms = (time.perf_counter() - t0) * 1000
    app.state.metrics.record_set(latency_ms)
    if not result.get("ok"):
        raise HTTPException(503, result.get("error", "quorum write failed"))
    return {**result, "latency_ms": round(latency_ms, 3)}


@app.get("/api/keys/{key}", summary="GET key")
async def get_key(key: str, node: int | None = None):
    t0 = time.perf_counter()
    try:
        result = await app.state.cluster.get(key, node)
    except Exception as exc:
        raise HTTPException(503, f"read failed: {exc}") from exc
    latency_ms = (time.perf_counter() - t0) * 1000
    app.state.metrics.record_get(latency_ms)
    if not result.get("found"):
        raise HTTPException(404, result.get("error", f"key not found: {key}"))
    return {**result, "latency_ms": round(latency_ms, 3)}


@app.delete("/api/keys/{key}", summary="DEL key")
async def del_key(key: str):
    t0 = time.perf_counter()
    result = await app.state.cluster.delete(key)
    latency_ms = (time.perf_counter() - t0) * 1000
    if not result.get("ok"):
        raise HTTPException(503, result.get("error", "delete failed"))
    return {**result, "latency_ms": round(latency_ms, 3)}


@app.get("/api/keys", summary="SCAN prefix")
async def scan_keys(prefix: str = "", limit: int = 100):
    t0 = time.perf_counter()
    result = await app.state.cluster.scan(prefix=prefix, limit=max(1, min(limit, 1000)))
    latency_ms = (time.perf_counter() - t0) * 1000
    if not result.get("ok"):
        raise HTTPException(503, result.get("error", "scan failed"))
    return {**result, "latency_ms": round(latency_ms, 3)}


@app.get("/api/cluster", summary="Cluster health snapshot")
async def cluster_status():
    return {"nodes": [n.meta.__dict__ for n in app.state.cluster.nodes.values()]}


def _container_name_for_node(node_id: int) -> str:
    return f"vaultkv-node{node_id}"


def _docker_control(app_: FastAPI, action: str, container_name: str) -> tuple[bool, str]:
    if DISABLE_DOCKER_CONTROL:
        return False, "container control disabled in this deployment"

    try:
        client = app_.state.docker
        if client is not None:
            container = client.containers.get(container_name)
            if action == "stop":
                container.stop(timeout=2)
            elif action == "start":
                container.start()
            else:
                return False, f"unsupported action: {action}"
            return True, ""
    except NotFound:
        return False, f"container not found: {container_name}"
    except DockerException as exc:
        return False, str(exc)

    # Fallback for host-local execution without docker SDK.
    proc = subprocess.run(["docker", action, container_name], capture_output=True, text=True)
    if proc.returncode == 0:
        return True, proc.stdout.strip()
    return False, proc.stderr.strip() or proc.stdout.strip()


@app.post("/api/nodes/{node_id}/kill", summary="Kill a node (Raft failover demo)")
async def kill_node(node_id: int):
    if node_id not in app.state.cluster.nodes:
        raise HTTPException(404, f"unknown node: {node_id}")
    ok, detail = _docker_control(app, "stop", _container_name_for_node(node_id))
    app.state.cluster.nodes[node_id].meta.healthy = False
    app.state.cluster.nodes[node_id].meta.is_leader = False
    app.state.cluster._elect_leader()
    return {
        "killed": node_id,
        "ok": ok,
        "detail": detail,
    }


@app.post("/api/nodes/{node_id}/restart", summary="Restart a killed node")
async def restart_node(node_id: int):
    if node_id not in app.state.cluster.nodes:
        raise HTTPException(404, f"unknown node: {node_id}")
    ok, detail = _docker_control(app, "start", _container_name_for_node(node_id))
    await asyncio.sleep(1.0)
    await app.state.cluster.nodes[node_id].connect()
    app.state.cluster._elect_leader()
    return {
        "restarted": node_id,
        "ok": ok,
        "detail": detail,
    }


@app.websocket("/ws/metrics")
async def ws_metrics(ws: WebSocket):
    await ws.accept()
    app.state.ws_clients.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if ws in app.state.ws_clients:
            app.state.ws_clients.remove(ws)


async def metrics_loop(app_: FastAPI):
    while True:
        await asyncio.sleep(0.5)
        snapshot = app_.state.metrics.snapshot()
        for node_id in sorted(app_.state.cluster.nodes):
            await app_.state.cluster.ping(node_id)
        app_.state.cluster._elect_leader()
        app_.state.cluster.apply_lag_estimate()
        snapshot["nodes"] = [n.meta.__dict__ for n in app_.state.cluster.nodes.values()]
        msg = json.dumps(snapshot)
        dead: list[WebSocket] = []
        for ws in app_.state.ws_clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in app_.state.ws_clients:
                app_.state.ws_clients.remove(ws)
