import { create } from "zustand";

export interface MetricsPoint {
  ts: number;
  set_ops_per_sec: number;
  get_ops_per_sec: number;
  set_p50_ms: number;
  set_p99_ms: number;
  get_p50_ms: number;
  get_p99_ms: number;
}

interface MetricsState {
  history: MetricsPoint[];
  push: (pt: MetricsPoint) => void;
}

export const useMetricsStore = create<MetricsState>((set) => ({
  history: [],
  push: (pt) =>
    set((s) => ({
      history: [...s.history.slice(-119), pt]
    }))
}));

