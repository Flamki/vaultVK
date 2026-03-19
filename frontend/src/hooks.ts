import { useEffect, useRef } from "react";

import { apiUrl, wsUrl } from "./lib/runtimeConfig";
import { useClusterStore } from "./store";

export function useSimulatedMetrics() {
  const setNodes = useClusterStore((s) => s.setNodes);
  const pushMetrics = useClusterStore((s) => s.pushMetrics);
  const setStatus = useClusterStore((s) => s.setStatus);
  const wsRef = useRef<WebSocket | null>(null);
  const previousRef = useRef<{ ts: number; set: number; get: number } | null>(null);

  useEffect(() => {
    let reconnectTimer: number | undefined;
    let pollTimer: number | undefined;
    let disposed = false;

    function consumeSnapshot(data: Record<string, unknown>) {
      const nodes = Array.isArray(data.nodes) ? (data.nodes as ReturnType<typeof useClusterStore.getState>["nodes"]) : null;
      const ts = typeof data.ts === "number" ? data.ts : Date.now() / 1000;
      if (nodes) setNodes(nodes);

      const hasOps =
        typeof data.set_ops_per_sec === "number" &&
        typeof data.get_ops_per_sec === "number" &&
        typeof data.set_p50_ms === "number" &&
        typeof data.set_p99_ms === "number" &&
        typeof data.get_p50_ms === "number" &&
        typeof data.get_p99_ms === "number";

      if (hasOps) {
        pushMetrics({
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

      const prev = previousRef.current;
      previousRef.current = { ts, set: totals.set, get: totals.get };
      if (!prev) return;

      const dt = Math.max(0.001, ts - prev.ts);
      const setOps = Math.max(0, Math.round((totals.set - prev.set) / dt));
      const getOps = Math.max(0, Math.round((totals.get - prev.get) / dt));
      const healthyNodes = nodes.filter((n) => n.healthy);
      const avgLatencyUs =
        healthyNodes.reduce((sum, n) => sum + n.latency_us, 0) / Math.max(1, healthyNodes.length);
      const baseMs = avgLatencyUs / 1000;

      pushMetrics({
        ts,
        set_ops_per_sec: setOps,
        get_ops_per_sec: getOps,
        set_p50_ms: Math.max(0.01, baseMs * 0.95),
        set_p99_ms: Math.max(0.02, baseMs * 1.75),
        get_p50_ms: Math.max(0.01, baseMs * 0.7),
        get_p99_ms: Math.max(0.02, baseMs * 1.35)
      });
    }

    async function pollCluster() {
      try {
        const res = await fetch(apiUrl("/api/cluster"));
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown>;
        consumeSnapshot(data);
      } catch {
        // ignore transient poll errors
      }
    }

    function connect() {
      if (disposed) return;
      setStatus("connecting");
      wsRef.current = new WebSocket(wsUrl("/ws/metrics"));

      wsRef.current.onopen = () => {
        setStatus("open");
      };
      wsRef.current.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as Record<string, unknown>;
          consumeSnapshot(parsed);
        } catch {
          // ignore malformed events
        }
      };
      wsRef.current.onerror = () => wsRef.current?.close();
      wsRef.current.onclose = () => {
        if (disposed) return;
        setStatus("closed");
        reconnectTimer = window.setTimeout(connect, 1800);
      };
    }

    void pollCluster();
    connect();
    pollTimer = window.setInterval(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        void pollCluster();
      }
    }, 2500);

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pollTimer) window.clearInterval(pollTimer);
      wsRef.current?.close();
    };
  }, [pushMetrics, setNodes, setStatus]);
}
