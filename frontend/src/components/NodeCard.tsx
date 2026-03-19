import { useState } from "react";

import clsx from "clsx";

import { apiUrl } from "../lib/runtimeConfig";
import { NodeMeta } from "../store/clusterStore";

interface Props {
  node: NodeMeta;
}

export function NodeCard({ node }: Props) {
  const [pendingKill, setPendingKill] = useState(false);
  const [pendingRestart, setPendingRestart] = useState(false);

  async function kill() {
    setPendingKill(true);
    try {
      await fetch(apiUrl(`/api/nodes/${node.node_id}/kill`), { method: "POST" });
    } finally {
      setPendingKill(false);
    }
  }

  async function restart() {
    setPendingRestart(true);
    try {
      await fetch(apiUrl(`/api/nodes/${node.node_id}/restart`), { method: "POST" });
    } finally {
      setPendingRestart(false);
    }
  }

  return (
    <div
      className={clsx(
        "rounded-2xl border bg-black/25 p-4 backdrop-blur-sm",
        "transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20",
        node.is_leader ? "border-sky-400/70 shadow-[0_0_38px_-20px_rgba(56,189,248,.95)]" : "border-white/10"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "h-2.5 w-2.5 rounded-full",
              node.healthy ? "bg-emerald-400 animate-pulseSoft" : "bg-red-500"
            )}
          />
          <span className="font-mono text-sm text-zinc-100">Node {node.node_id}</span>
          {node.is_leader && node.healthy ? (
            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
              LEADER
            </span>
          ) : null}
        </div>
        <span className="font-mono text-[11px] text-zinc-400">
          {node.host}:{node.port}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <Metric title="latency" value={`${node.latency_us.toFixed(0)} us`} tone="text-amber-300" />
        <Metric title="rep lag" value={`${node.lag_ms.toFixed(1)} ms`} tone="text-orange-300" />
        <Metric title="SET ops" value={node.ops_set.toLocaleString()} tone="text-teal-300" />
        <Metric title="GET ops" value={node.ops_get.toLocaleString()} tone="text-sky-300" />
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={kill}
          disabled={!node.healthy || pendingKill}
          className="flex-1 rounded-md bg-red-900/50 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-800 disabled:opacity-40"
        >
          {pendingKill ? "Killing..." : "Kill"}
        </button>
        <button
          onClick={restart}
          disabled={node.healthy || pendingRestart}
          className="flex-1 rounded-md bg-ink-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-ink-700 disabled:opacity-40"
        >
          {pendingRestart ? "Restarting..." : "Restart"}
        </button>
      </div>
    </div>
  );
}

function Metric({ title, value, tone }: { title: string; value: string; tone: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/25 p-2">
      <div className="mb-0.5 text-[10px] text-zinc-500">{title}</div>
      <div className={clsx("truncate text-[12px]", tone)}>{value}</div>
    </div>
  );
}
