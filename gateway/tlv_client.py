from __future__ import annotations

import struct
from typing import Any

OP_PING = 0x01
OP_SET = 0x02
OP_GET = 0x03
OP_DEL = 0x04
OP_SCAN = 0x05

OP_ACK = 0x80
OP_ERR = 0x81
OP_VAL = 0x82
OP_SCAN_RESULT = 0x83


def encode_set_payload(key: str, value: str) -> bytes:
    kb = key.encode("utf-8")
    vb = value.encode("utf-8")
    return struct.pack("<H", len(kb)) + kb + struct.pack("<L", len(vb)) + vb


def encode_key_payload(key: str) -> bytes:
    kb = key.encode("utf-8")
    return struct.pack("<H", len(kb)) + kb


def encode_scan_payload(prefix: str, limit: int) -> bytes:
    pb = prefix.encode("utf-8")
    return struct.pack("<H", len(pb)) + pb + struct.pack("<H", max(1, limit))


def parse_ack_payload(payload: bytes) -> dict[str, Any]:
    if len(payload) < 10:
        return {"seq": 0, "message": ""}
    seq = struct.unpack_from("<Q", payload, 0)[0]
    msg_len = struct.unpack_from("<H", payload, 8)[0]
    msg = payload[10 : 10 + msg_len].decode("utf-8", errors="replace")
    return {"seq": int(seq), "message": msg}


def parse_err_payload(payload: bytes) -> dict[str, Any]:
    if len(payload) < 4:
        return {"code": 0, "message": "unknown error"}
    code = struct.unpack_from("<H", payload, 0)[0]
    msg_len = struct.unpack_from("<H", payload, 2)[0]
    msg = payload[4 : 4 + msg_len].decode("utf-8", errors="replace")
    return {"code": int(code), "message": msg}


def parse_value_payload(payload: bytes) -> str:
    if len(payload) < 4:
        return ""
    value_len = struct.unpack_from("<L", payload, 0)[0]
    return payload[4 : 4 + value_len].decode("utf-8", errors="replace")


def parse_scan_result_payload(payload: bytes) -> list[dict[str, str]]:
    if len(payload) < 2:
        return []
    offset = 0
    count = struct.unpack_from("<H", payload, offset)[0]
    offset += 2
    out: list[dict[str, str]] = []
    for _ in range(count):
        if offset + 2 > len(payload):
            break
        key_len = struct.unpack_from("<H", payload, offset)[0]
        offset += 2
        if offset + key_len + 4 > len(payload):
            break
        key = payload[offset : offset + key_len].decode("utf-8", errors="replace")
        offset += key_len
        val_len = struct.unpack_from("<L", payload, offset)[0]
        offset += 4
        if offset + val_len > len(payload):
            break
        value = payload[offset : offset + val_len].decode("utf-8", errors="replace")
        offset += val_len
        out.append({"key": key, "value": value})
    return out

