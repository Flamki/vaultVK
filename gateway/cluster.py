from __future__ import annotations

import asyncio
import struct
import time
from dataclasses import dataclass
from typing import Optional

from tlv_client import (
    OP_ACK,
    OP_DEL,
    OP_ERR,
    OP_GET,
    OP_PING,
    OP_SCAN,
    OP_SCAN_RESULT,
    OP_SET,
    OP_VAL,
    encode_key_payload,
    encode_scan_payload,
    encode_set_payload,
    parse_ack_payload,
    parse_err_payload,
    parse_scan_result_payload,
    parse_value_payload,
)


@dataclass
class NodeMetrics:
    node_id: int
    host: str
    port: int
    healthy: bool = False
    is_leader: bool = False
    ops_set: int = 0
    ops_get: int = 0
    lag_ms: float = 0.0
    latency_us: float = 0.0
    key_count: int = 0
    last_seen: float = 0.0
    wal_seq: int = 0


class VaultKVNode:
    def __init__(self, node_id: int, host: str, port: int):
        self.meta = NodeMetrics(node_id=node_id, host=host, port=port)
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._lock = asyncio.Lock()

    async def connect(self) -> None:
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.meta.host, self.meta.port),
                timeout=2.0,
            )
            self.meta.healthy = True
        except Exception:
            self.meta.healthy = False
            self._reader = None
            self._writer = None

    async def close(self) -> None:
        if self._writer is not None:
            self._writer.close()
            try:
                await self._writer.wait_closed()
            except Exception:
                pass
        self._reader = None
        self._writer = None
        self.meta.healthy = False

    async def send_frame(self, op: int, payload: bytes) -> tuple[int, bytes]:
        async with self._lock:
            if self._writer is None or self._reader is None or not self.meta.healthy:
                await self.connect()
            if self._writer is None or self._reader is None:
                raise ConnectionError(f"node {self.meta.node_id} unavailable")

            frame = struct.pack("<BBL", op, 0, len(payload)) + payload
            t0 = time.perf_counter()
            try:
                self._writer.write(frame)
                await self._writer.drain()
                hdr = await asyncio.wait_for(self._reader.readexactly(6), timeout=3.0)
                rtype, _, rlen = struct.unpack("<BBL", hdr)
                body = await self._reader.readexactly(rlen) if rlen else b""
                self.meta.latency_us = (time.perf_counter() - t0) * 1_000_000
                self.meta.last_seen = time.time()
                self.meta.healthy = True
                return int(rtype), body
            except Exception:
                await self.close()
                raise


class ClusterManager:
    def __init__(self, nodes: list[tuple[int, str, int]]):
        self.nodes = {nid: VaultKVNode(nid, host, port) for nid, host, port in nodes}
        self._leader_id = nodes[0][0] if nodes else 1

    async def startup(self) -> None:
        await asyncio.gather(*(n.connect() for n in self.nodes.values()))
        self._elect_leader()

    async def shutdown(self) -> None:
        await asyncio.gather(*(n.close() for n in self.nodes.values()))

    def _elect_leader(self) -> None:
        healthy_ids = sorted([nid for nid, n in self.nodes.items() if n.meta.healthy])
        if healthy_ids:
            if self._leader_id not in healthy_ids:
                self._leader_id = healthy_ids[0]
        for nid, node in self.nodes.items():
            node.meta.is_leader = nid == self._leader_id and node.meta.healthy

    def leader(self) -> VaultKVNode:
        self._elect_leader()
        return self.nodes[self._leader_id]

    async def ping(self, node_id: int) -> dict:
        node = self.nodes[node_id]
        try:
            rtype, rbody = await node.send_frame(OP_PING, b"")
            if rtype == OP_ACK:
                ack = parse_ack_payload(rbody)
                node.meta.wal_seq = int(ack.get("seq", 0))
                node.meta.healthy = True
                return {"ok": True, "seq": node.meta.wal_seq}
            node.meta.healthy = False
            return {"ok": False, "seq": node.meta.wal_seq}
        except Exception:
            node.meta.healthy = False
            return {"ok": False, "seq": node.meta.wal_seq}

    async def set(self, key: str, value: str) -> dict:
        node = self.leader()
        payload = encode_set_payload(key, value)
        rtype, rbody = await node.send_frame(OP_SET, payload)
        if rtype == OP_ACK:
            ack = parse_ack_payload(rbody)
            node.meta.ops_set += 1
            node.meta.wal_seq = int(ack.get("seq", node.meta.wal_seq))
            return {"ok": True, "seq": ack.get("seq", 0), "leader_node": node.meta.node_id}
        err = parse_err_payload(rbody)
        return {"ok": False, "error": err.get("message", "set failed"), "leader_node": node.meta.node_id}

    async def get(self, key: str, node_id: int | None = None) -> dict:
        node = self.nodes.get(node_id or self._leader_id) or self.leader()
        payload = encode_key_payload(key)
        rtype, rbody = await node.send_frame(OP_GET, payload)
        node.meta.ops_get += 1
        if rtype == OP_VAL:
            return {"found": True, "value": parse_value_payload(rbody), "node_id": node.meta.node_id}
        if rtype == OP_ERR:
            err = parse_err_payload(rbody)
            return {"found": False, "error": err.get("message", "not found"), "node_id": node.meta.node_id}
        return {"found": False, "node_id": node.meta.node_id}

    async def delete(self, key: str) -> dict:
        node = self.leader()
        payload = encode_key_payload(key)
        rtype, rbody = await node.send_frame(OP_DEL, payload)
        if rtype == OP_ACK:
            ack = parse_ack_payload(rbody)
            return {"ok": True, "seq": ack.get("seq", 0), "leader_node": node.meta.node_id}
        err = parse_err_payload(rbody)
        return {"ok": False, "error": err.get("message", "delete failed"), "leader_node": node.meta.node_id}

    async def scan(self, prefix: str = "", limit: int = 100) -> dict:
        node = self.leader()
        payload = encode_scan_payload(prefix, limit)
        rtype, rbody = await node.send_frame(OP_SCAN, payload)
        if rtype == OP_SCAN_RESULT:
            rows = parse_scan_result_payload(rbody)
            node.meta.key_count = max(node.meta.key_count, len(rows))
            return {"ok": True, "count": len(rows), "items": rows, "node_id": node.meta.node_id}
        err = parse_err_payload(rbody)
        return {"ok": False, "error": err.get("message", "scan failed"), "items": [], "node_id": node.meta.node_id}

    def apply_lag_estimate(self) -> None:
        leader_seq = self.nodes[self._leader_id].meta.wal_seq if self._leader_id in self.nodes else 0
        for nid, node in self.nodes.items():
            if nid == self._leader_id:
                node.meta.lag_ms = 0.0
            else:
                seq_gap = max(0, leader_seq - node.meta.wal_seq)
                node.meta.lag_ms = float(seq_gap * 10.0)

