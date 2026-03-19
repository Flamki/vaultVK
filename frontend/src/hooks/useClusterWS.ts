import { useEffect, useRef } from "react";

import { useClusterStore } from "../store/clusterStore";
import { useMetricsStore } from "../store/metricsStore";
import { wsUrl } from "../lib/runtimeConfig";

export function useClusterWS() {
  const ws = useRef<WebSocket | null>(null);
  const { setNodes, setStatus } = useClusterStore();
  const { push } = useMetricsStore();

  useEffect(() => {
    let timer: number | undefined;

    function connect() {
      const url = wsUrl("/ws/metrics");
      ws.current = new WebSocket(url);
      setStatus("connecting");

      ws.current.onopen = () => {
        setStatus("open");
        ws.current?.send("hello");
      };
      ws.current.onclose = () => {
        setStatus("closed");
        timer = window.setTimeout(connect, 2000);
      };
      ws.current.onerror = () => ws.current?.close();
      ws.current.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.nodes) setNodes(data.nodes);
          push({
            ts: data.ts ?? Date.now() / 1000,
            set_ops_per_sec: data.set_ops_per_sec ?? 0,
            get_ops_per_sec: data.get_ops_per_sec ?? 0,
            set_p50_ms: data.set_p50_ms ?? 0,
            set_p99_ms: data.set_p99_ms ?? 0,
            get_p50_ms: data.get_p50_ms ?? 0,
            get_p99_ms: data.get_p99_ms ?? 0
          });
        } catch {
          // Ignore malformed payloads but keep stream alive.
        }
      };
    }

    connect();
    return () => {
      if (timer) window.clearTimeout(timer);
      ws.current?.close();
    };
  }, [push, setNodes, setStatus]);
}
