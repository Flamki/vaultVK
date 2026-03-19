from __future__ import annotations

import time
from collections import deque
from typing import Deque


class MetricsCollector:
    def __init__(self, window: int = 60) -> None:
        self.window = window
        self._sets: Deque[tuple[float, float]] = deque()
        self._gets: Deque[tuple[float, float]] = deque()

    def _trim(self, q: Deque[tuple[float, float]]) -> None:
        cutoff = time.time() - self.window
        while q and q[0][0] < cutoff:
            q.popleft()

    def record_set(self, latency_ms: float) -> None:
        self._sets.append((time.time(), latency_ms))
        self._trim(self._sets)

    def record_get(self, latency_ms: float) -> None:
        self._gets.append((time.time(), latency_ms))
        self._trim(self._gets)

    @staticmethod
    def _percentile(q: Deque[tuple[float, float]], p: int) -> float:
        vals = sorted(lat for _, lat in q)
        if not vals:
            return 0.0
        idx = int(len(vals) * p / 100)
        if idx >= len(vals):
            idx = len(vals) - 1
        return float(vals[idx])

    def snapshot(self) -> dict:
        self._trim(self._sets)
        self._trim(self._gets)
        now = time.time()
        one_sec = now - 1.0
        set_ops = sum(1 for t, _ in self._sets if t >= one_sec)
        get_ops = sum(1 for t, _ in self._gets if t >= one_sec)
        return {
            "ts": now,
            "set_ops_per_sec": set_ops,
            "get_ops_per_sec": get_ops,
            "set_p50_ms": self._percentile(self._sets, 50),
            "set_p99_ms": self._percentile(self._sets, 99),
            "get_p50_ms": self._percentile(self._gets, 50),
            "get_p99_ms": self._percentile(self._gets, 99),
        }

