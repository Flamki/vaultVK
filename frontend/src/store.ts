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

type NodeActionResult = { ok: boolean; detail: string; simulated?: boolean };

interface ClusterState {
  nodes: NodeMeta[];
  history: MetricsPoint[];
  forcedDownNodeIds: number[];
  wsStatus: "connecting" | "open" | "closed";
  setNodes: (nodes: NodeMeta[]) => void;
  pushMetrics: (pt: MetricsPoint) => void;
  setStatus: (s: "connecting" | "open" | "closed") => void;
  killNode: (id: number) => Promise<NodeActionResult>;
  restartNode: (id: number) => Promise<NodeActionResult>;
}

function applyForcedDown(nodes: NodeMeta[], forcedDownNodeIds: number[]): NodeMeta[] {
  if (forcedDownNodeIds.length === 0) return nodes;
  const forcedSet = new Set(forcedDownNodeIds);
  return nodes.map((node) =>
    forcedSet.has(node.node_id) ? { ...node, healthy: false, is_leader: false } : node
  );
}

function shouldUseClientSimulation(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("container not found") ||
    normalized.includes("docker") ||
    normalized.includes("permission denied") ||
    normalized.includes("network error") ||
    normalized.includes("connection refused")
  );
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
  forcedDownNodeIds: [],
  wsStatus: "connecting",
  setNodes: (nodes) =>
    set((state) => ({
      nodes: applyForcedDown(nodes, state.forcedDownNodeIds)
    })),
  pushMetrics: (pt) =>
    set((state) => ({
      history: [...state.history.slice(-119), pt]
    })),
  setStatus: (wsStatus) => set({ wsStatus }),
  killNode: async (id) => {
    const previous = useClusterStore.getState();
    set((state) => ({
      forcedDownNodeIds: state.forcedDownNodeIds.includes(id)
        ? state.forcedDownNodeIds
        : [...state.forcedDownNodeIds, id],
      nodes: state.nodes.map((n) =>
        n.node_id === id ? { ...n, healthy: false, is_leader: false } : n
      )
    }));
    try {
      const res = await fetch(apiUrl(`/api/nodes/${id}/kill`), { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        detail?: string;
        simulated?: boolean;
      };
      const backendOk = Boolean(body.ok);
      const backendSimulated = Boolean(body.simulated);
      const detail = body.detail ?? (backendOk ? "node kill applied" : `kill failed (HTTP ${res.status})`);
      const clientSimulated = !backendOk && !backendSimulated && shouldUseClientSimulation(detail);
      const ok = backendOk || backendSimulated || clientSimulated;
      if (!ok) {
        set({
          nodes: previous.nodes,
          forcedDownNodeIds: previous.forcedDownNodeIds
        });
      }
      return {
        ok,
        detail: clientSimulated ? `${detail}; using client simulated node-down mode` : detail,
        simulated: backendSimulated || clientSimulated || undefined
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "network error during kill";
      const clientSimulated = shouldUseClientSimulation(detail);
      if (!clientSimulated) {
        set({
          nodes: previous.nodes,
          forcedDownNodeIds: previous.forcedDownNodeIds
        });
      }
      return {
        ok: clientSimulated,
        detail: clientSimulated ? `${detail}; using client simulated node-down mode` : detail,
        simulated: clientSimulated || undefined
      };
    }
  },
  restartNode: async (id) => {
    const previous = useClusterStore.getState();
    set((state) => ({
      forcedDownNodeIds: state.forcedDownNodeIds.filter((nodeId) => nodeId !== id),
      nodes: state.nodes.map((n) => (n.node_id === id ? { ...n, healthy: true } : n))
    }));
    try {
      const res = await fetch(apiUrl(`/api/nodes/${id}/restart`), { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        detail?: string;
        simulated?: boolean;
      };
      const backendOk = Boolean(body.ok);
      const backendSimulated = Boolean(body.simulated);
      const detail = body.detail ?? (backendOk ? "node restart applied" : `restart failed (HTTP ${res.status})`);
      const clientSimulated = !backendOk && !backendSimulated && shouldUseClientSimulation(detail);
      const ok = backendOk || backendSimulated || clientSimulated;
      if (!ok) {
        set({
          nodes: previous.nodes,
          forcedDownNodeIds: previous.forcedDownNodeIds
        });
      }
      return {
        ok,
        detail: clientSimulated ? `${detail}; using client simulated node-recover mode` : detail,
        simulated: backendSimulated || clientSimulated || undefined
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "network error during restart";
      const clientSimulated = shouldUseClientSimulation(detail);
      if (!clientSimulated) {
        set({
          nodes: previous.nodes,
          forcedDownNodeIds: previous.forcedDownNodeIds
        });
      }
      return {
        ok: clientSimulated,
        detail: clientSimulated ? `${detail}; using client simulated node-recover mode` : detail,
        simulated: clientSimulated || undefined
      };
    }
  }
}));
