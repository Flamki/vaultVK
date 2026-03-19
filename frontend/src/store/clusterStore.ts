import { create } from "zustand";

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
  last_seen?: number;
  wal_seq?: number;
}

interface ClusterState {
  nodes: NodeMeta[];
  wsStatus: "connecting" | "open" | "closed";
  setNodes: (nodes: NodeMeta[]) => void;
  setStatus: (s: ClusterState["wsStatus"]) => void;
}

export const useClusterStore = create<ClusterState>((set) => ({
  nodes: [],
  wsStatus: "connecting",
  setNodes: (nodes) => set({ nodes }),
  setStatus: (wsStatus) => set({ wsStatus })
}));

