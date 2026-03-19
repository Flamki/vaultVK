import { LagChart } from "../components/LagChart";
import { NodeCard } from "../components/NodeCard";
import { OpsChart } from "../components/OpsChart";
import { useClusterStore } from "../store/clusterStore";
import { useMetricsStore } from "../store/metricsStore";

export function Dashboard() {
  const nodes = useClusterStore((s) => s.nodes);
  const wsStatus = useClusterStore((s) => s.wsStatus);
  const lastUpdated = useClusterStore((s) => s.lastUpdated);
  const history = useMetricsStore((s) => s.history);
  const leader = nodes.find((n) => n.is_leader);
  const healthy = nodes.filter((n) => n.healthy);
  const latest = history[history.length - 1];
  const totalKeys = healthy.reduce((sum, n) => sum + n.key_count, 0);
  const avgLatencyUs = healthy.length
    ? healthy.reduce((sum, n) => sum + n.latency_us, 0) / healthy.length
    : 0;

  return (
    <div className="space-y-5 p-6">
      <header className="animate-floatIn overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-ink-900/90 via-ink-800/85 to-ink-900/90 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Cluster Mission Control</h2>
            <p className="text-sm text-zinc-400">Live telemetry from gateway stream with HTTP fallback recovery.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono md:grid-cols-4">
            <Chip
              label="cluster"
              value={`${healthy.length}/${Math.max(nodes.length, 3)} healthy`}
              tone={healthy.length === 0 ? "danger" : "ok"}
            />
            <Chip label="leader" value={leader ? `node ${leader.node_id}` : "election"} tone="info" />
            <Chip
              label="throughput"
              value={latest ? `${(latest.set_ops_per_sec + latest.get_ops_per_sec).toLocaleString()} ops/s` : "warming up"}
              tone="neutral"
            />
            <Chip
              label="last update"
              value={lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "pending"}
              tone={wsStatus === "open" ? "ok" : "neutral"}
            />
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat title="Total Keys" value={totalKeys.toLocaleString()} note="across healthy nodes" />
        <Stat title="Avg Latency" value={`${avgLatencyUs.toFixed(0)} us`} note="healthy node mean" />
        <Stat title="SET Ops/s" value={latest ? latest.set_ops_per_sec.toLocaleString() : "0"} note="latest sample" />
        <Stat title="GET Ops/s" value={latest ? latest.get_ops_per_sec.toLocaleString() : "0"} note="latest sample" />
      </section>

      {!nodes.length ? (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Waiting for first cluster snapshot. If this takes more than a few seconds, verify gateway reachability.
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {nodes.map((node) => (
          <NodeCard key={node.node_id} node={node} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <OpsChart />
        <LagChart />
      </section>
    </div>
  );
}

function Stat({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[0_14px_40px_-28px_rgba(45,212,191,.8)]">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{note}</p>
    </article>
  );
}

function Chip({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "ok" | "info" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
      : tone === "info"
        ? "border-sky-400/35 bg-sky-500/10 text-sky-200"
        : tone === "danger"
          ? "border-rose-400/35 bg-rose-500/10 text-rose-200"
          : "border-white/15 bg-white/5 text-zinc-200";

  return (
    <div className={`rounded-xl border px-2.5 py-2 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-[0.22em] opacity-80">{label}</p>
      <p className="mt-1 text-[11px] font-semibold">{value}</p>
    </div>
  );
}
