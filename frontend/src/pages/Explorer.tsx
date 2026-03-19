import { useMemo, useState } from "react";

import { KeyTable } from "../components/KeyTable";
import { apiUrl } from "../lib/runtimeConfig";
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
  const canRun = op === "SCAN" ? true : key.trim().length > 0;

  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => a.node_id - b.node_id), [nodes]);

  async function execute() {
    if (!canRun) return;
    setLoading(true);
    const t0 = performance.now();
    const requestedKey = key.trim();

    try {
      let res: Response;
      if (op === "SET") {
        res = await fetch(apiUrl("/api/keys"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: requestedKey, value: val })
        });
      } else if (op === "GET") {
        const qs = node ? `?node=${node}` : "";
        res = await fetch(apiUrl(`/api/keys/${encodeURIComponent(requestedKey)}${qs}`));
      } else if (op === "DEL") {
        res = await fetch(apiUrl(`/api/keys/${encodeURIComponent(requestedKey)}`), { method: "DELETE" });
      } else {
        res = await fetch(apiUrl(`/api/keys?prefix=${encodeURIComponent(requestedKey)}&limit=50`));
      }

      const data = (await res.json()) as Record<string, unknown>;
      const latency = Number(data.latency_ms ?? performance.now() - t0);
      const value =
        op === "SCAN"
          ? JSON.stringify(data.items ?? [])
          : typeof data.value === "string"
            ? data.value
            : data.error
              ? String(data.error)
              : JSON.stringify(data);
      const errorText = String(data.error ?? data.detail ?? "request failed");

      setHistory((h) => [
        {
          op,
          key: requestedKey || "(empty-prefix)",
          value,
          latency_ms: latency,
          ok: res.ok,
          error: res.ok ? undefined : errorText,
          ts: Date.now()
        },
        ...h.slice(0, 99)
      ]);
    } catch (e) {
      const err = e as Error;
      setHistory((h) => [
        {
          op,
          key: requestedKey || "(empty-prefix)",
          ok: false,
          error: err.message,
          latency_ms: performance.now() - t0,
          ts: Date.now()
        },
        ...h.slice(0, 99)
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-6">
      <header className="rounded-3xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-xl font-semibold text-white">Key Explorer</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Execute real GET/SET/DEL/SCAN operations against live cluster nodes.
        </p>
      </header>

      <section className="rounded-3xl border border-white/10 bg-black/20 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["GET", "SET", "DEL", "SCAN"] as Op[]).map((item) => (
            <button
              key={item}
              onClick={() => setOp(item)}
              className={`rounded-full px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] transition ${
                op === item ? "bg-white text-ink-950" : "bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {item}
            </button>
          ))}
          <select
            value={node ?? ""}
            onChange={(e) => setNode(e.target.value ? Number(e.target.value) : null)}
            className="ml-auto rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono text-zinc-200"
          >
            <option value="">Leader (default)</option>
            {sortedNodes.map((n) => (
              <option key={n.node_id} value={n.node_id}>
                Node {n.node_id}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void execute();
            }}
            placeholder={op === "SCAN" ? "prefix (optional, for example user:)" : "key"}
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-mono text-zinc-100 outline-none transition focus:border-sky-400/70"
          />
          {op === "SET" ? (
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void execute();
              }}
              placeholder="value"
              className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-mono text-zinc-100 outline-none transition focus:border-teal-400/70"
            />
          ) : null}
          <button
            onClick={execute}
            disabled={loading || !canRun}
            className="rounded-xl bg-gradient-to-r from-teal-400 to-sky-400 px-5 py-2 text-sm font-semibold text-ink-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Running..." : "Run"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <button
            onClick={() => {
              setOp("SET");
              setKey("hello");
              setVal("world");
            }}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 hover:bg-white/10"
          >
            sample set
          </button>
          <button
            onClick={() => {
              setOp("GET");
              setKey("hello");
            }}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 hover:bg-white/10"
          >
            sample get
          </button>
          <span className="ml-auto font-mono text-[11px] text-zinc-500">history {history.length}/100</span>
        </div>
      </section>

      <KeyTable rows={history} />
    </div>
  );
}
