#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
import time


def run(*args: str) -> str:
    out = subprocess.check_output([sys.executable, "scripts/tlv_client.py", *args], text=True)
    return out.strip()


def wait_ping(port: int, attempts: int = 40) -> None:
    for _ in range(attempts):
        try:
            run("--host", "127.0.0.1", "--port", str(port), "ping")
            return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"node {port} did not become ready")


def main() -> int:
    wait_ping(7379)
    wait_ping(7380)
    wait_ping(7381)

    key = "demo:quorum:key"
    value = f"vaultkv-replicated-{int(time.time())}"
    print(run("--host", "127.0.0.1", "--port", "7379", "set", key, value))

    leader = run("--raw", "--host", "127.0.0.1", "--port", "7379", "get", key)
    f2 = run("--raw", "--host", "127.0.0.1", "--port", "7380", "get", key)
    f3 = run("--raw", "--host", "127.0.0.1", "--port", "7381", "get", key)

    if leader != value or f2 != value or f3 != value:
        print("quorum demo failed")
        print(f"leader={leader}")
        print(f"follower2={f2}")
        print(f"follower3={f3}")
        print(f"expected={value}")
        return 1

    print("quorum demo success")
    print(f"key={key}")
    print(f"value={value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

