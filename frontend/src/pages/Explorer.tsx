import { useMemo, useState } from "react";

import { KeyTable } from "../components/KeyTable";
import { useClusterStore } from "../store/clusterStore";

type Op = "GET" | "SET" | "DEL" | "SCAN";
type ResultRow = {
  op: Op;
  key: string;
  value?: string;
  latency_ms: number;
  ok: boolean;
  error?: string;
  ts: number;
};

export function Explorer() {
  const [op, setOp] = useState<Op>("GET");
  const [key, setKey] = useState("");
  const [val, setVal] = useState("");
  const [node, setNode] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ResultRow[]>([]);
  const nodes = useClusterStore((s) => s.nodes);

  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => a.node_id - b.node_id), [nodes]);

  async function execute() {
    if (!key.trim()) return;
    setLoading(true);
    const t0 = performance.now();
    try {
      let res: Response;
      if (op === "SET") {
        res = await fetch("/api/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value: val })
        });
      } else if (op === "GET") {
        const qs = node ? `?node=${node}` : "";
        res = await fetch(`/api/keys/${encodeURIComponent(key)}${qs}`);
      } else if (op === "DEL") {
        res = await fetch(`/api/keys/${encodeURIComponent(key)}`, { method: "DELETE" });
      } else {
        res = await fetch(`/api/keys?prefix=${encodeURIComponent(key)}&limit=50`);
      }

      const data = await res.json();
      const latency = Number(data.latency_ms ?? performance.now() - t0);
      const value =
        op === "SCAN"
          ? JSON.stringify(data.items ?? [], null, 0)
          : data.value ?? data.error ?? JSON.stringify(data);
      setHistory((h) => [
        {
          op,
          key,
          value,
          latency_ms: latency,
          ok: res.ok,
          error: res.ok ? undefined : data.error ?? data.detail ?? "request failed",
          ts: Date.now()
        },
        ...h.slice(0, 59)
      ]);
    } catch (e) {
      const err = e as Error;
      setHistory((h) => [
        {
          op,
          key,
          ok: false,
          error: err.message,
          latency_ms: performance.now() - t0,
          ts: Date.now()
        },
        ...h.slice(0, 59)
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-6">
      <header className="rounded-2xl border border-ink-700 bg-ink-900/85 p-4 animate-floatIn">
        <h1 className="text-lg font-semibold text-zinc-100">Key Explorer</h1>
        <p className="text-sm text-zinc-400">Run GET, SET, DEL, and SCAN against live cluster nodes.</p>
      </header>

      <section className="rounded-2xl border border-ink-700 bg-ink-900/85 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {(["GET", "SET", "DEL", "SCAN"] as Op[]).map((item) => (
            <button
              key={item}
              onClick={() => setOp(item)}
              className={`rounded-md px-4 py-1.5 font-mono text-sm transition ${
                op === item ? "bg-sky-600 text-white" : "bg-ink-800 text-zinc-300 hover:bg-ink-700"
              }`}
            >
              {item}
            </button>
          ))}
          <select
            value={node ?? ""}
            onChange={(e) => setNode(e.target.value ? Number(e.target.value) : null)}
            className="ml-auto rounded-md border border-ink-700 bg-ink-800 px-2 py-1.5 text-xs font-mono text-zinc-200"
          >
            <option value="">Leader (default)</option>
            {sortedNodes.map((n) => (
              <option key={n.node_id} value={n.node_id}>
                Node {n.node_id}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={op === "SCAN" ? "prefix (for example user:)" : "key"}
            className="flex-1 rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-mono text-zinc-100 outline-none transition focus:border-sky-500"
          />
          {op === "SET" ? (
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder="value"
              className="flex-1 rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-mono text-zinc-100 outline-none transition focus:border-teal-500"
            />
          ) : null}
          <button
            onClick={execute}
            disabled={loading}
            className="rounded-md bg-gradient-to-r from-teal-500 to-sky-500 px-5 py-2 text-sm font-semibold text-ink-950 transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Running..." : "Run"}
          </button>
        </div>
      </section>

      <KeyTable rows={history} />
    </div>
  );
}

