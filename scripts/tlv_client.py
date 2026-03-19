#!/usr/bin/env python3
import argparse
import socket
import struct
import sys

PING = 0x01
SET = 0x02
GET = 0x03
DEL = 0x04
SCAN = 0x05
ACK = 0x80
ERR = 0x81
VAL = 0x82
SCAN_RESULT = 0x83


def pack_frame(op: int, payload: bytes) -> bytes:
    return struct.pack("<BBI", op, 0, len(payload)) + payload


def recv_exact(sock: socket.socket, n: int) -> bytes:
    out = b""
    while len(out) < n:
        chunk = sock.recv(n - len(out))
        if not chunk:
            raise ConnectionError("socket closed")
        out += chunk
    return out


def roundtrip(host: str, port: int, frame: bytes, timeout: float):
    with socket.create_connection((host, port), timeout=timeout) as s:
        s.settimeout(timeout)
        s.sendall(frame)
        hdr = recv_exact(s, 6)
        op, flags, length = struct.unpack("<BBI", hdr)
        payload = recv_exact(s, length) if length else b""
        return op, payload


def encode_set(key: str, value: str) -> bytes:
    kb = key.encode("utf-8")
    vb = value.encode("utf-8")
    return struct.pack("<H", len(kb)) + kb + struct.pack("<I", len(vb)) + vb


def encode_key(key: str) -> bytes:
    kb = key.encode("utf-8")
    return struct.pack("<H", len(kb)) + kb


def encode_scan(prefix: str, limit: int) -> bytes:
    pb = prefix.encode("utf-8")
    return struct.pack("<H", len(pb)) + pb + struct.pack("<H", limit)


def decode_ack(payload: bytes):
    if len(payload) < 10:
        raise ValueError("bad ack payload")
    seq = struct.unpack_from("<Q", payload, 0)[0]
    msg_len = struct.unpack_from("<H", payload, 8)[0]
    msg = payload[10 : 10 + msg_len].decode("utf-8", errors="replace")
    return seq, msg


def decode_err(payload: bytes):
    if len(payload) < 4:
        raise ValueError("bad err payload")
    code = struct.unpack_from("<H", payload, 0)[0]
    msg_len = struct.unpack_from("<H", payload, 2)[0]
    msg = payload[4 : 4 + msg_len].decode("utf-8", errors="replace")
    return code, msg


def decode_val(payload: bytes):
    if len(payload) < 4:
        raise ValueError("bad val payload")
    n = struct.unpack_from("<I", payload, 0)[0]
    return payload[4 : 4 + n].decode("utf-8", errors="replace")


def decode_scan(payload: bytes):
    off = 0
    if len(payload) < 2:
        raise ValueError("bad scan payload")
    count = struct.unpack_from("<H", payload, off)[0]
    off += 2
    rows = []
    for _ in range(count):
        klen = struct.unpack_from("<H", payload, off)[0]
        off += 2
        key = payload[off : off + klen].decode("utf-8", errors="replace")
        off += klen
        vlen = struct.unpack_from("<I", payload, off)[0]
        off += 4
        value = payload[off : off + vlen].decode("utf-8", errors="replace")
        off += vlen
        rows.append((key, value))
    return rows


def main():
    parser = argparse.ArgumentParser(description="VaultKV TLV client")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7379)
    parser.add_argument("--timeout", type=float, default=2.0)
    parser.add_argument("--raw", action="store_true", help="print only value on GET")

    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("ping")
    p_set = sub.add_parser("set")
    p_set.add_argument("key")
    p_set.add_argument("value")
    p_get = sub.add_parser("get")
    p_get.add_argument("key")
    p_del = sub.add_parser("del")
    p_del.add_argument("key")
    p_scan = sub.add_parser("scan")
    p_scan.add_argument("prefix")
    p_scan.add_argument("--limit", type=int, default=20)

    args = parser.parse_args()

    if args.cmd == "ping":
        op, payload = roundtrip(args.host, args.port, pack_frame(PING, b""), args.timeout)
    elif args.cmd == "set":
        op, payload = roundtrip(args.host, args.port, pack_frame(SET, encode_set(args.key, args.value)), args.timeout)
    elif args.cmd == "get":
        op, payload = roundtrip(args.host, args.port, pack_frame(GET, encode_key(args.key)), args.timeout)
    elif args.cmd == "del":
        op, payload = roundtrip(args.host, args.port, pack_frame(DEL, encode_key(args.key)), args.timeout)
    elif args.cmd == "scan":
        op, payload = roundtrip(
            args.host, args.port, pack_frame(SCAN, encode_scan(args.prefix, max(1, args.limit))), args.timeout
        )
    else:
        raise RuntimeError("unknown command")

    if op == ACK:
        seq, msg = decode_ack(payload)
        print(f"ACK seq={seq} msg={msg}")
        return 0
    if op == ERR:
        code, msg = decode_err(payload)
        print(f"ERR code={code} msg={msg}")
        return 2
    if op == VAL:
        value = decode_val(payload)
        if args.raw:
            print(value)
        else:
            print(f"VAL {value}")
        return 0
    if op == SCAN_RESULT:
        rows = decode_scan(payload)
        for k, v in rows:
            print(f"{k} => {v}")
        return 0

    print(f"unexpected opcode={op}")
    return 3


if __name__ == "__main__":
    sys.exit(main())
