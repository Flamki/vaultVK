import { useEffect, useRef } from "react";

import { apiUrl, wsUrl } from "../lib/runtimeConfig";
import { useClusterStore } from "../store/clusterStore";
import { useMetricsStore } from "../store/metricsStore";

export function useClusterWS() {
  const ws = useRef<WebSocket | null>(null);
  const wsOpenRef = useRef(false);
  const prevTotals = useRef<{ ts: number; set: number; get: number } | null>(null);
  const { setNodes, setStatus } = useClusterStore();
  const { push } = useMetricsStore();

  useEffect(() => {
    let reconnectTimer: number | undefined;
    let pollTimer: number | undefined;
    let disposed = false;

    function ingest(data: Record<string, unknown>) {
      const nodes = Array.isArray(data.nodes) ? (data.nodes as Parameters<typeof setNodes>[0]) : undefined;
      const ts = typeof data.ts === "number" ? data.ts : Date.now() / 1000;

      if (nodes) setNodes(nodes);

      const hasDirectMetrics =
        typeof data.set_ops_per_sec === "number" &&
        typeof data.get_ops_per_sec === "number" &&
        typeof data.set_p50_ms === "number" &&
        typeof data.set_p99_ms === "number" &&
        typeof data.get_p50_ms === "number" &&
        typeof data.get_p99_ms === "number";

      if (hasDirectMetrics) {
        push({
          ts,
          set_ops_per_sec: data.set_ops_per_sec as number,
          get_ops_per_sec: data.get_ops_per_sec as number,
          set_p50_ms: data.set_p50_ms as number,
          set_p99_ms: data.set_p99_ms as number,
          get_p50_ms: data.get_p50_ms as number,
          get_p99_ms: data.get_p99_ms as number
        });
        return;
      }

      if (!nodes) return;

      const totals = nodes.reduce(
        (acc, n) => {
          if (n.healthy) {
            acc.set += n.ops_set;
            acc.get += n.ops_get;
          }
          return acc;
        },
        { set: 0, get: 0 }
      );

      if (!prevTotals.current) {
        prevTotals.current = { ts, ...totals };
        return;
      }

      const dt = Math.max(0.001, ts - prevTotals.current.ts);
      const setDelta = Math.max(0, totals.set - prevTotals.current.set);
      const getDelta = Math.max(0, totals.get - prevTotals.current.get);
      const setOps = Math.round(setDelta / dt);
      const getOps = Math.round(getDelta / dt);
      const avgLatencyUs =
        nodes.filter((n) => n.healthy).reduce((sum, n) => sum + n.latency_us, 0) / Math.max(1, nodes.filter((n) => n.healthy).length);
      const baseMs = avgLatencyUs / 1000;

      push({
        ts,
        set_ops_per_sec: setOps,
        get_ops_per_sec: getOps,
        set_p50_ms: Math.max(0.01, baseMs * 0.95),
        set_p99_ms: Math.max(0.02, baseMs * 1.75),
        get_p50_ms: Math.max(0.01, baseMs * 0.7),
        get_p99_ms: Math.max(0.02, baseMs * 1.35)
      });

      prevTotals.current = { ts, ...totals };
    }

    async function fetchClusterSnapshot() {
      try {
        const res = await fetch(apiUrl("/api/cluster"));
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown>;
        ingest(data);
      } catch {
        // Keep retrying quietly; WS/poll loop handles resilience.
      }
    }

    function connect() {
      if (disposed) return;
      const url = wsUrl("/ws/metrics");
      ws.current = new WebSocket(url);
      setStatus("connecting");
      wsOpenRef.current = false;

      ws.current.onopen = () => {
        if (disposed) return;
        wsOpenRef.current = true;
        setStatus("open");
        ws.current?.send("hello");
      };
      ws.current.onclose = () => {
        wsOpenRef.current = false;
        if (disposed) return;
        setStatus("closed");
        reconnectTimer = window.setTimeout(connect, 2000);
      };
      ws.current.onerror = () => ws.current?.close();
      ws.current.onmessage = (e) => {
        try {
          ingest(JSON.parse(e.data) as Record<string, unknown>);
        } catch {
          // Ignore malformed payloads but keep stream alive.
        }
      };
    }

    void fetchClusterSnapshot();
    connect();

    pollTimer = window.setInterval(() => {
      if (!wsOpenRef.current) {
        void fetchClusterSnapshot();
      }
    }, 2500);

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pollTimer) window.clearInterval(pollTimer);
      ws.current?.close();
    };
  }, [push, setNodes, setStatus]);
}
