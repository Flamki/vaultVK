import { create } from "zustand";

import { apiUrl } from "./lib/runtimeConfig";

export interface NodeMeta {
  node_id: number;
  host: string;
  port: number;
  healthy: boolean;
  is_leader: boolean;
  ops_set: number;
  ops_get: number;
  lag_ms: number;
  latency_us: number;
  key_count: number;
}

export interface MetricsPoint {
  ts: number;
  set_ops_per_sec: number;
  get_ops_per_sec: number;
  set_p50_ms: number;
  set_p99_ms: number;
  get_p50_ms: number;
  get_p99_ms: number;
}

interface ClusterState {
  nodes: NodeMeta[];
  history: MetricsPoint[];
  wsStatus: "connecting" | "open" | "closed";
  setNodes: (nodes: NodeMeta[]) => void;
  pushMetrics: (pt: MetricsPoint) => void;
  setStatus: (s: "connecting" | "open" | "closed") => void;
  killNode: (id: number) => void;
  restartNode: (id: number) => void;
}

export const useClusterStore = create<ClusterState>((set) => ({
  nodes: [
    {
      node_id: 1,
      host: "vaultkv-node1",
      port: 7379,
      healthy: true,
      is_leader: true,
      ops_set: 0,
      ops_get: 0,
      lag_ms: 0,
      latency_us: 120,
      key_count: 0
    },
    {
      node_id: 2,
      host: "vaultkv-node2",
      port: 7380,
      healthy: true,
      is_leader: false,
      ops_set: 0,
      ops_get: 0,
      lag_ms: 0,
      latency_us: 145,
      key_count: 0
    },
    {
      node_id: 3,
      host: "vaultkv-node3",
      port: 7381,
      healthy: true,
      is_leader: false,
      ops_set: 0,
      ops_get: 0,
      lag_ms: 0,
      latency_us: 160,
      key_count: 0
    }
  ],
  history: [],
  wsStatus: "connecting",
  setNodes: (nodes) => set({ nodes }),
  pushMetrics: (pt) =>
    set((state) => ({
      history: [...state.history.slice(-119), pt]
    })),
  setStatus: (wsStatus) => set({ wsStatus }),
  killNode: (id) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.node_id === id ? { ...n, healthy: false, is_leader: false } : n
      )
    }));
    void fetch(apiUrl(`/api/nodes/${id}/kill`), { method: "POST" }).catch(() => {
      // UI remains responsive even if backend action fails.
    });
  },
  restartNode: (id) => {
    set((state) => ({
      nodes: state.nodes.map((n) => (n.node_id === id ? { ...n, healthy: true } : n))
    }));
    void fetch(apiUrl(`/api/nodes/${id}/restart`), { method: "POST" }).catch(() => {
      // UI remains responsive even if backend action fails.
    });
  }
}));
