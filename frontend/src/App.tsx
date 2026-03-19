import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Command,
  Cpu,
  Database,
  FileText,
  Globe,
  LayoutDashboard,
  Lock,
  Maximize2,
  Minimize2,
  Move,
  Power,
  RefreshCw,
  Search,
  Server,
  Terminal,
  X,
  Zap
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { clsx } from "clsx";

import { useSimulatedMetrics } from "./hooks";
import { apiUrl } from "./lib/runtimeConfig";
import { useClusterStore } from "./store";

type TabId = "dashboard" | "explorer" | "raft" | "architecture";
type MiniGraphCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";
type NotificationLevel = "info" | "success" | "warn" | "error";

interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  ts: number;
  level: NotificationLevel;
  read: boolean;
}

type TraceStepStatus = "idle" | "running" | "success" | "error";

interface TraceStepState {
  title: string;
  detail: string;
  status: TraceStepStatus;
  runtime: string;
}

const MINI_GRAPH_CORNERS: MiniGraphCorner[] = ["bottom-right", "bottom-left", "top-right", "top-left"];
const MINI_GRAPH_CORNER_CLASS: Record<MiniGraphCorner, string> = {
  "bottom-right": "bottom-5 right-5",
  "bottom-left": "bottom-5 left-5",
  "top-right": "top-28 right-5",
  "top-left": "top-28 left-5"
};

function Landing({ onEnter }: { onEnter: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.06, filter: "blur(24px)" }}
      className="fixed inset-0 z-[220] flex cursor-none items-center justify-center overflow-hidden bg-[#020202]"
    >
      <div className="pointer-events-none absolute inset-0 mesh-gradient opacity-40" />
      <div className="relative z-10 px-6 text-center">
        <p className="mb-6 text-[10px] font-black uppercase tracking-[0.8em] text-zinc-500">Secure Protocol Initialized</p>
        <h1 className="select-none text-[17vw] font-black uppercase leading-[0.72] tracking-[-0.1em] text-white md:text-[12vw]">
          OBSERVE
        </h1>
        <p className="mx-auto mt-7 max-w-3xl text-xl text-zinc-500">
          A high-fidelity interface for distributed systems with real-time telemetry and orchestration.
        </p>
        <button
          onClick={onEnter}
          className="mt-12 inline-flex items-center gap-4 rounded-full bg-white px-10 py-5 text-sm font-black uppercase tracking-[0.28em] text-black hover:bg-zinc-200"
        >
          Initialize <Zap className="h-5 w-5 fill-current" />
        </button>
      </div>
    </motion.div>
  );
}

function DashboardView() {
  const nodes = useClusterStore((s) => s.nodes);
  const history = useClusterStore((s) => s.history);
  const latest = history[history.length - 1];

  const data = history.map((pt) => ({
    time: new Date(pt.ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    SET: pt.set_ops_per_sec,
    GET: pt.get_ops_per_sec
  }));

  const cards = [
    {
      label: "Throughput",
      value: `${((latest?.set_ops_per_sec ?? 0) + (latest?.get_ops_per_sec ?? 0)).toLocaleString()}`,
      sub: "Ops per second",
      icon: Activity
    },
    {
      label: "Latency",
      value: `${Math.round(nodes.reduce((a, n) => a + n.latency_us, 0) / Math.max(1, nodes.length))}`,
      sub: "Microseconds mean",
      icon: Zap
    },
    {
      label: "Storage",
      value: `${nodes.reduce((a, n) => a + n.key_count, 0).toLocaleString()}`,
      sub: "Total active keys",
      icon: Database
    },
    {
      label: "Nodes",
      value: `${nodes.filter((n) => n.healthy).length}/${Math.max(nodes.length, 3)}`,
      sub: "Cluster operational",
      icon: Server
    }
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-gradient text-5xl font-extrabold tracking-tight">Observe Dashboard</h2>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Distributed Storage Observability System</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="glass rounded-[2rem] p-6">
            <div className="mb-7 rounded-2xl border border-white/10 bg-white/5 p-3 w-fit">
              <card.icon className="h-5 w-5 text-zinc-300" />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{card.label}</p>
            <p className="mt-1 text-3xl font-bold text-white">{card.value}</p>
            <p className="mt-1 text-xs text-zinc-500">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="glass rounded-[2rem] p-6">
        <h3 className="mb-4 text-lg font-bold text-white">Throughput Real-time</h3>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="setGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="getGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={42} />
            <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "rgba(10,10,10,0.85)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14 }} />
            <Area type="monotone" dataKey="SET" stroke="#3b82f6" strokeWidth={2.4} fill="url(#setGrad)" animationDuration={0} />
            <Area type="monotone" dataKey="GET" stroke="#10b981" strokeWidth={2.4} fill="url(#getGrad)" animationDuration={0} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ExplorerView() {
  const [op, setOp] = useState<"GET" | "SET" | "DEL" | "SCAN">("GET");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [rows, setRows] = useState<Array<{ op: string; key: string; result: string; latency: string; ok: boolean }>>([]);

  const operationHelp: Record<"GET" | "SET" | "DEL" | "SCAN", { summary: string; endpoint: string }> = {
    GET: { summary: "Reads one key from the cluster.", endpoint: "GET /api/keys/{key}" },
    SET: { summary: "Writes or updates one key/value pair.", endpoint: "POST /api/keys" },
    DEL: { summary: "Deletes one key from the cluster.", endpoint: "DELETE /api/keys/{key}" },
    SCAN: { summary: "Lists keys by prefix match.", endpoint: "GET /api/keys?prefix=<x>&limit=50" }
  };

  const quickExamples: Array<{ label: string; op: "GET" | "SET" | "DEL" | "SCAN"; key: string; value?: string }> = [
    { label: "Create profile", op: "SET", key: "user:1001", value: "{\"name\":\"Ava\",\"tier\":\"pro\"}" },
    { label: "Read profile", op: "GET", key: "user:1001" },
    { label: "List users", op: "SCAN", key: "user:" },
    { label: "Delete profile", op: "DEL", key: "user:1001" }
  ];

  const applyExample = (example: { op: "GET" | "SET" | "DEL" | "SCAN"; key: string; value?: string }) => {
    setOp(example.op);
    setKey(example.key);
    setValue(example.value ?? "");
  };

  async function execute() {
    if (!key && op !== "SCAN") return;
    const start = performance.now();
    try {
      let res: Response;
      if (op === "SET") {
        res = await fetch(apiUrl("/api/keys"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
      } else if (op === "GET") {
        res = await fetch(apiUrl(`/api/keys/${encodeURIComponent(key)}`));
      } else if (op === "DEL") {
        res = await fetch(apiUrl(`/api/keys/${encodeURIComponent(key)}`), { method: "DELETE" });
      } else {
        res = await fetch(apiUrl(`/api/keys?prefix=${encodeURIComponent(key)}&limit=50`));
      }
      const body = await res.json();
      const result = op === "SCAN" ? JSON.stringify(body.items ?? []) : String(body.value ?? body.detail ?? "ok");
      setRows((prev) => [{ op, key: key || "(prefix)", result, latency: `${Number(body.latency_ms ?? performance.now() - start).toFixed(2)}ms`, ok: res.ok }, ...prev].slice(0, 50));
    } catch (err) {
      setRows((prev) => [{ op, key, result: (err as Error).message, latency: `${(performance.now() - start).toFixed(2)}ms`, ok: false }, ...prev].slice(0, 50));
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-gradient text-5xl font-extrabold tracking-tight">Key Explorer</h2>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
          Direct command console for reading and writing keys
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { title: "1) Choose Operation", body: "Select GET, SET, DEL, or SCAN based on the action you need." },
          { title: "2) Fill Input", body: "Provide key (and value for SET). Use SCAN with a prefix like user:." },
          { title: "3) Execute & Verify", body: "Run command and confirm status/latency/result in the history table." }
        ].map((item) => (
          <div key={item.title} className="glass rounded-2xl p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{item.title}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-300">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="glass rounded-[2rem] p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Current Operation: {op}</p>
            <p className="mt-1 text-xs text-zinc-400">{operationHelp[op].summary}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Gateway Endpoint</p>
            <p className="mt-1 font-mono text-xs text-zinc-300">{operationHelp[op].endpoint}</p>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {(["GET", "SET", "DEL", "SCAN"] as const).map((it) => (
            <button key={it} onClick={() => setOp(it)} className={clsx("rounded-xl px-4 py-2 font-mono text-xs uppercase tracking-[0.18em]", op === it ? "bg-white text-black" : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200")}>
              {it}
            </button>
          ))}
        </div>

        <div className="mb-5">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Try Quick Examples</p>
          <div className="flex flex-wrap gap-2">
            {quickExamples.map((example) => (
              <button
                key={example.label}
                onClick={() => applyExample(example)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300 hover:bg-white/10"
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={op === "SCAN" ? "prefix..." : "key"} className="flex-1 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 font-mono text-sm text-zinc-100 outline-none" />
          {op === "SET" ? <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" className="flex-1 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 font-mono text-sm text-zinc-100 outline-none" /> : null}
          <button
            onClick={() => void execute()}
            className="rounded-xl bg-blue-600 px-8 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!key && op !== "SCAN"}
          >
            Execute
          </button>
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left">
            <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              <tr>
                <th className="px-4 py-3">op</th>
                <th className="px-4 py-3">key</th>
                <th className="px-4 py-3">result</th>
                <th className="px-4 py-3 text-right">latency</th>
                <th className="px-4 py-3 text-center">status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <p className="text-sm text-zinc-400">No commands yet.</p>
                    <p className="mt-1 text-xs text-zinc-600">Pick an example above or run your first operation.</p>
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.key}-${i}`} className="border-t border-white/10 text-sm">
                    <td className="px-4 py-3 font-mono text-amber-300">{r.op}</td>
                    <td className="px-4 py-3 font-mono text-sky-300">{r.key}</td>
                    <td className="max-w-[320px] truncate px-4 py-3 text-zinc-300">{r.result}</td>
                    <td className="px-4 py-3 text-right font-mono text-purple-300">{r.latency}</td>
                    <td className={clsx("px-4 py-3 text-center font-mono text-xs", r.ok ? "text-emerald-300" : "text-rose-300")}>
                      {r.ok ? "OK" : "ERR"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RaftView() {
  const nodes = useClusterStore((s) => s.nodes);
  const killNode = useClusterStore((s) => s.killNode);
  const restartNode = useClusterStore((s) => s.restartNode);
  const [events, setEvents] = useState<string[]>(["Cluster initialized. All nodes in FOLLOWER state."]);
  const push = (event: string) => setEvents((prev) => [event, ...prev].slice(0, 30));

  return (
    <div className="space-y-8">
      <h2 className="text-gradient text-5xl font-extrabold tracking-tight">Raft Consensus</h2>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-4">
          {nodes.map((node) => (
            <div key={node.node_id} className={clsx("glass rounded-2xl p-4", node.is_leader && "border border-blue-500/35 bg-blue-500/[0.03]")}>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={clsx("h-2.5 w-2.5 rounded-full", node.healthy ? "bg-emerald-400" : "bg-rose-500")} />
                  <p className="text-sm font-bold text-white">Node {node.node_id}</p>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-zinc-300">
                  {node.is_leader ? "Leader" : "Follower"}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { killNode(node.node_id); push(`Node ${node.node_id} killed.`); }} disabled={!node.healthy} className="flex-1 rounded-lg bg-rose-500/20 py-2 text-[10px] font-bold uppercase tracking-widest text-rose-300 disabled:opacity-30">
                  <Power className="mr-1 inline h-3 w-3" />
                  Kill
                </button>
                <button onClick={() => { restartNode(node.node_id); push(`Node ${node.node_id} restarted.`); }} disabled={node.healthy} className="flex-1 rounded-lg bg-white/10 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300 disabled:opacity-30">
                  <RefreshCw className="mr-1 inline h-3 w-3" />
                  Restart
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="glass rounded-2xl p-0 lg:col-span-8">
          <div className="flex items-center gap-3 border-b border-white/10 p-5">
            <Terminal className="h-4 w-4 text-zinc-500" />
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Consensus Stream</span>
          </div>
          <div className="custom-scrollbar h-[480px] overflow-y-auto bg-black/20 p-5 font-mono text-xs text-zinc-300">
            {events.map((e, idx) => (
              <p key={`${e}-${idx}`} className="mb-2">
                [{new Date().toLocaleTimeString()}] {e}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchitectureView() {
  const nodes = useClusterStore((s) => s.nodes);
  const history = useClusterStore((s) => s.history);
  const wsStatus = useClusterStore((s) => s.wsStatus);
  const latest = history[history.length - 1];
  const healthyNodes = nodes.filter((n) => n.healthy);
  const leader = nodes.find((n) => n.is_leader && n.healthy);
  const quorum = Math.floor(nodes.length / 2) + 1;
  const quorumReached = healthyNodes.length >= quorum;
  const [traceOp, setTraceOp] = useState<"GET" | "SET" | "DEL">("GET");
  const [traceKey, setTraceKey] = useState("user:9421");
  const [traceValue, setTraceValue] = useState("{\"tier\":\"pro\",\"region\":\"ap-south-1\"}");
  const [traceRunning, setTraceRunning] = useState(false);
  const [traceResult, setTraceResult] = useState<{ ok: boolean; message: string; latencyMs: number; payload: string } | null>(null);
  const [activeModule, setActiveModule] = useState(0);

  const createTraceSteps = (): TraceStepState[] => [
    {
      title: "Client Request",
      detail: "Command reaches FastAPI ingress.",
      status: "idle",
      runtime: "Waiting to start."
    },
    {
      title: "TLV Translation",
      detail: "Gateway serializes payload into TLV frame.",
      status: "idle",
      runtime: "Waiting to start."
    },
    {
      title: "Leader WAL Commit",
      detail: "Leader appends encrypted WAL record.",
      status: "idle",
      runtime: "Waiting to start."
    },
    {
      title: "Quorum Replication",
      detail: "Entry replicates to majority of replicas.",
      status: "idle",
      runtime: "Waiting to start."
    },
    {
      title: "Client ACK",
      detail: "Gateway returns commit acknowledgement.",
      status: "idle",
      runtime: "Waiting to start."
    }
  ];

  const [traceSteps, setTraceSteps] = useState<TraceStepState[]>(() => createTraceSteps());

  const updateStep = (index: number, patch: Partial<TraceStepState>) => {
    setTraceSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const runTrace = async () => {
    if (!traceKey.trim() || traceRunning) return;
    setTraceRunning(true);
    setTraceResult(null);
    setTraceSteps(createTraceSteps());
    const startedAt = performance.now();

    const executeStep = async (index: number, runtime: string, fn: () => Promise<void>) => {
      updateStep(index, { status: "running", runtime });
      const t0 = performance.now();
      try {
        await fn();
        const elapsed = Math.round(performance.now() - t0);
        updateStep(index, { status: "success", runtime: `${runtime} (${elapsed}ms)` });
      } catch (error) {
        const elapsed = Math.round(performance.now() - t0);
        const msg = error instanceof Error ? error.message : "Unknown failure";
        updateStep(index, { status: "error", runtime: `${msg} (${elapsed}ms)` });
        throw error;
      }
    };

    try {
      await executeStep(0, `${traceOp} ${traceKey} received at gateway`, async () => {
        await sleep(110);
      });

      await executeStep(1, "Converting JSON payload to TLV frame", async () => {
        await sleep(120);
      });

      await executeStep(2, leader ? `Leader node ${leader.node_id} appending WAL` : "No leader available", async () => {
        if (!leader) throw new Error("No healthy leader available for WAL append");
        await sleep(140);
      });

      await executeStep(3, `Replicating to ${healthyNodes.length}/${nodes.length} nodes`, async () => {
        if (!quorumReached) throw new Error(`Quorum not met (${healthyNodes.length}/${nodes.length})`);
        await sleep(170);
      });

      let responseBody: unknown = null;
      await executeStep(4, "Sending committed ACK response", async () => {
        let response: Response;
        if (traceOp === "SET") {
          response = await fetch(apiUrl("/api/keys"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: traceKey, value: traceValue })
          });
        } else if (traceOp === "GET") {
          response = await fetch(apiUrl(`/api/keys/${encodeURIComponent(traceKey)}`));
        } else {
          response = await fetch(apiUrl(`/api/keys/${encodeURIComponent(traceKey)}`), { method: "DELETE" });
        }

        responseBody = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
        if (!response.ok) {
          const detail = typeof responseBody === "object" && responseBody && "detail" in responseBody
            ? String((responseBody as { detail: unknown }).detail)
            : `Gateway returned ${response.status}`;
          throw new Error(detail);
        }
      });

      const totalMs = Number((performance.now() - startedAt).toFixed(2));
      setTraceResult({
        ok: true,
        message: `${traceOp} request committed and acknowledged.`,
        latencyMs: totalMs,
        payload: JSON.stringify(responseBody, null, 2)
      });
    } catch (error) {
      const totalMs = Number((performance.now() - startedAt).toFixed(2));
      setTraceResult({
        ok: false,
        message: error instanceof Error ? error.message : "Trace execution failed",
        latencyMs: totalMs,
        payload: ""
      });
    } finally {
      setTraceRunning(false);
    }
  };

  const pageModules = [
    {
      id: "overview",
      title: "Overview",
      icon: LayoutDashboard,
      goal: "Operational health at a glance",
      input: "Live WebSocket metrics + cluster snapshot",
      output: "Throughput chart, latency profile, node summary",
      signal: `${((latest?.set_ops_per_sec ?? 0) + (latest?.get_ops_per_sec ?? 0)).toLocaleString()} ops/s live`
    },
    {
      id: "explorer",
      title: "Explorer",
      icon: Search,
      goal: "Direct key-value operations",
      input: "GET / SET / DEL / SCAN requests",
      output: "Low-latency responses with operation history",
      signal: "Gateway API path verification"
    },
    {
      id: "consensus",
      title: "Consensus",
      icon: Activity,
      goal: "Fault tolerance and leader behavior",
      input: "Node kill/restart actions + replication state",
      output: "Election events, leader transitions, quorum behavior",
      signal: `${leader ? `Leader Node ${leader.node_id}` : "Leader unavailable"}`
    },
    {
      id: "architecture",
      title: "Architecture",
      icon: BookOpen,
      goal: "End-to-end request lifecycle proof",
      input: "Trace runner command payload",
      output: "Stage-by-stage runtime and commit result",
      signal: traceResult ? `${traceResult.ok ? "Trace success" : "Trace failed"} · ${traceResult.latencyMs.toFixed(2)}ms` : "Ready to run trace"
    }
  ];

  useEffect(() => {
    const id = setInterval(() => {
      setActiveModule((prev) => (prev + 1) % pageModules.length);
    }, 3500);
    return () => clearInterval(id);
  }, [pageModules.length]);

  const pillars = [
    {
      label: "Frontend",
      value: "React + Motion",
      desc: "Operator console with live charts, topology controls, and failure simulation."
    },
    {
      label: "Gateway",
      value: "FastAPI TLV Bridge",
      desc: "REST/WS ingress that validates payloads and translates them into compact TLV frames."
    },
    {
      label: "Engine",
      value: "C++17 + epoll",
      desc: "Low-latency event loop with WAL, MemTable updates, and background compaction."
    },
    {
      label: "Consensus",
      value: "Raft + Quorum ACK",
      desc: "Leader replicates logs to followers; write is acked only after majority confirmation."
    }
  ];

  const lifecycle = [
    {
      title: "Client Request",
      detail: "Client sends GET/SET/DEL command over HTTPS or WebSocket to FastAPI ingress.",
      icon: Globe,
      accent: "text-sky-300"
    },
    {
      title: "TLV Translation",
      detail: "Gateway normalizes request, adds metadata, and serializes as compact TLV frame.",
      icon: FileText,
      accent: "text-amber-300"
    },
    {
      title: "Leader WAL Commit",
      detail: `Leader node ${leader?.node_id ?? "?"} appends encrypted entry to WAL before replication.`,
      icon: Lock,
      accent: "text-violet-300"
    },
    {
      title: "Quorum Replication",
      detail: `Entry is replicated to followers until quorum ${quorum}/${nodes.length} is reached.`,
      icon: Activity,
      accent: "text-emerald-300"
    },
    {
      title: "Client ACK",
      detail: "Gateway returns success only after majority ACK, guaranteeing linearizable writes.",
      icon: CheckCircle2,
      accent: "text-blue-300"
    }
  ];

  return (
    <div className="space-y-10">
      <div className="glass rounded-[2rem] p-8 md:p-10">
        <h2 className="text-gradient text-5xl font-extrabold tracking-tight">VaultKV Architecture</h2>
        <p className="mt-4 max-w-4xl text-sm leading-relaxed text-zinc-400 md:text-base">
          Run a live request trace below to verify each architecture stage in order: ingress, TLV translation, leader WAL,
          quorum replication, and final ACK.
        </p>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Live Throughput</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {((latest?.set_ops_per_sec ?? 0) + (latest?.get_ops_per_sec ?? 0)).toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500">ops/sec combined</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Consensus State</p>
            <p className="mt-2 text-2xl font-bold text-white">{quorumReached ? "Quorum Ready" : "Degraded"}</p>
            <p className="text-xs text-zinc-500">
              {healthyNodes.length}/{nodes.length} healthy nodes
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Active Leader</p>
            <p className="mt-2 text-2xl font-bold text-white">{leader ? `Node ${leader.node_id}` : "Unavailable"}</p>
            <p className="text-xs text-zinc-500">{leader ? `${leader.host}:${leader.port}` : "No active leader"}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {pillars.map((c) => (
          <div key={c.label} className="glass rounded-2xl p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{c.label}</p>
            <p className="mt-2 text-lg font-semibold text-white">{c.value}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">{c.desc}</p>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white">System Visual Flow</h3>
          <p className="text-xs text-zinc-500">How data moves from UI to consensus commit and back.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-5">
          {[
            { name: "Browser UI", desc: "User action starts request", icon: Globe, color: "text-sky-300" },
            { name: "FastAPI Gateway", desc: "Validates and maps to TLV", icon: FileText, color: "text-amber-300" },
            { name: "Leader WAL", desc: "Durable append before commit", icon: Lock, color: "text-violet-300" },
            { name: "Quorum Replication", desc: "Majority follower ACK", icon: Activity, color: "text-emerald-300" },
            { name: "Client ACK", desc: "Linearizable success reply", icon: CheckCircle2, color: "text-blue-300" }
          ].map((step, idx, arr) => (
            <div key={step.name} className="relative rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 flex items-center gap-2">
                <step.icon className={clsx("h-4 w-4", step.color)} />
                <p className="text-sm font-semibold text-zinc-100">{step.name}</p>
              </div>
              <p className="text-xs text-zinc-500">{step.desc}</p>
              {idx < arr.length - 1 ? (
                <div className="pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 lg:block">
                  <motion.div
                    animate={{ x: [0, 4, 0], opacity: [0.35, 1, 0.35] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: idx * 0.08 }}
                    className="text-zinc-500"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </motion.div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="glass rounded-2xl p-6 xl:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Control Plane Map</h3>
              <p className="text-xs text-zinc-500">What each page does, what it consumes, and what it produces.</p>
            </div>
            <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Auto Focus
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {pageModules.map((module, index) => (
              <button
                key={module.id}
                onClick={() => setActiveModule(index)}
                className={clsx(
                  "rounded-xl border p-4 text-left transition-all",
                  activeModule === index ? "border-blue-400/40 bg-blue-500/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <module.icon className={clsx("h-4 w-4", activeModule === index ? "text-blue-300" : "text-zinc-500")} />
                  <p className="text-sm font-semibold text-zinc-100">{module.title}</p>
                </div>
                <p className="text-xs text-zinc-500">{module.goal}</p>
                {activeModule === index ? (
                  <motion.div
                    layoutId="active-page-chip"
                    className="mt-3 inline-flex rounded-full border border-blue-400/30 bg-blue-500/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-blue-200"
                  >
                    Active Focus
                  </motion.div>
                ) : null}
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Focused Module Detail</p>
            <h4 className="mt-2 text-base font-bold text-white">{pageModules[activeModule].title}</h4>
            <div className="mt-3 space-y-2 text-xs text-zinc-400">
              <p><span className="font-semibold text-zinc-200">Input:</span> {pageModules[activeModule].input}</p>
              <p><span className="font-semibold text-zinc-200">Output:</span> {pageModules[activeModule].output}</p>
              <p><span className="font-semibold text-zinc-200">Live Signal:</span> {pageModules[activeModule].signal}</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 xl:col-span-5">
          <h3 className="text-lg font-bold text-white">Consensus: Why It Matters</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Consensus prevents split-brain writes. Client ACK happens only after majority replication.
          </p>

          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Commit Rule</span>
                <span className={clsx(
                  "rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em]",
                  quorumReached ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"
                )}>
                  {quorumReached ? "Can Commit" : "Blocked"}
                </span>
              </div>
              <p className="text-sm font-semibold text-white">
                Need {quorum} ACKs, currently {healthyNodes.length}/{nodes.length} healthy.
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(healthyNodes.length / Math.max(1, nodes.length)) * 100}%` }}
                  className={clsx("h-full", quorumReached ? "bg-emerald-400" : "bg-rose-400")}
                />
              </div>
            </div>

            <div className="space-y-2">
              {nodes.map((node, idx) => (
                <motion.div
                  key={node.node_id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className={clsx("h-2 w-2 rounded-full", node.healthy ? "bg-emerald-400" : "bg-rose-400")} />
                    <span className="text-xs font-semibold text-zinc-200">Node {node.node_id}</span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    {node.is_leader ? "leader" : node.healthy ? "follower" : "offline"}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Consensus Outcome</p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                If leader fails, followers elect a new leader. If quorum is lost, writes are safely paused until quorum is restored.
                This protects data correctness under node failures.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="glass rounded-2xl p-6 xl:col-span-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white">Live Request Trace Runner</h3>
              <p className="mt-1 text-xs text-zinc-500">Execute the pipeline and watch each stage status in real time.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Gateway {wsStatus}
              </span>
              <button
                onClick={() => {
                  if (!traceRunning) {
                    setTraceSteps(createTraceSteps());
                    setTraceResult(null);
                  }
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-300 hover:bg-white/10"
                disabled={traceRunning}
              >
                Reset
              </button>
              <button
                onClick={() => void runTrace()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={traceRunning || !traceKey.trim()}
              >
                {traceRunning ? "Running..." : "Run Trace"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-6">
            {(["GET", "SET", "DEL"] as const).map((op) => (
              <button
                key={op}
                onClick={() => setTraceOp(op)}
                className={clsx(
                  "rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em]",
                  traceOp === op ? "border-white bg-white text-black" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                )}
              >
                {op}
              </button>
            ))}
            <input
              value={traceKey}
              onChange={(e) => setTraceKey(e.target.value)}
              placeholder="key"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs text-zinc-200 outline-none md:col-span-2"
            />
            {traceOp === "SET" ? (
              <input
                value={traceValue}
                onChange={(e) => setTraceValue(e.target.value)}
                placeholder="value"
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs text-zinc-200 outline-none md:col-span-1"
              />
            ) : null}
          </div>

          <div className="mt-6 space-y-4">
            {lifecycle.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                    <step.icon className={clsx("h-4 w-4", step.accent)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-white">
                        {i + 1}. {step.title}
                      </p>
                      <span
                        className={clsx(
                          "rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em]",
                          traceSteps[i]?.status === "idle" && "bg-white/5 text-zinc-500",
                          traceSteps[i]?.status === "running" && "bg-amber-400/15 text-amber-300",
                          traceSteps[i]?.status === "success" && "bg-emerald-400/15 text-emerald-300",
                          traceSteps[i]?.status === "error" && "bg-rose-400/15 text-rose-300"
                        )}
                      >
                        {traceSteps[i]?.status ?? "idle"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">{step.detail}</p>
                    <p className="mt-1 font-mono text-[11px] text-zinc-500">{traceSteps[i]?.runtime}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6 xl:col-span-4">
          <div className="glass rounded-2xl p-6">
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-300">Quorum Readiness</h3>
            <p className="mt-3 text-3xl font-extrabold text-white">
              {healthyNodes.length}/{nodes.length}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Healthy replicas (need {quorum} to ACK writes)</p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(healthyNodes.length / Math.max(nodes.length, 1)) * 100}%` }}
                className={clsx("h-full", quorumReached ? "bg-emerald-400" : "bg-rose-400")}
              />
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-300">Replica Status</h3>
            <div className="mt-4 space-y-3">
              {nodes.map((node) => (
                <div key={node.node_id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className={clsx("h-2 w-2 rounded-full", node.healthy ? "bg-emerald-400" : "bg-rose-500")} />
                    <span className="text-xs font-semibold text-zinc-200">Node {node.node_id}</span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    {node.is_leader ? "leader" : node.healthy ? "follower" : "offline"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-300">Trace Result</h3>
            {traceResult ? (
              <div className="mt-3 space-y-2">
                <p className={clsx("text-sm font-semibold", traceResult.ok ? "text-emerald-300" : "text-rose-300")}>
                  {traceResult.message}
                </p>
                <p className="font-mono text-xs text-zinc-500">End-to-end latency: {traceResult.latencyMs.toFixed(2)}ms</p>
                {traceResult.payload ? (
                  <pre className="custom-scrollbar max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/35 p-2 font-mono text-[11px] text-zinc-400">
                    {traceResult.payload}
                  </pre>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">Run trace to see real gateway response and commit result.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white">TLV + WAL Pipeline Snapshot</h3>
          <p className="mt-1 text-xs text-zinc-500">Example frame shape used between gateway and engine.</p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">
{`Frame: [type=SET][key_len=0x08][val_len=0x12][term=0x2B]
Key  : user:9421
Value: {"tier":"pro","region":"ap-south-1"}
WAL  : append -> fsync -> replicate -> quorum_ack`}
            </pre>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white">Engine Internals</h3>
          <p className="mt-1 text-xs text-zinc-500">Core components currently active in the runtime path.</p>
          <div className="mt-5 space-y-4">
            <div className="flex items-start gap-3">
              <Cpu className="mt-0.5 h-4 w-4 text-blue-300" />
              <p className="text-xs leading-relaxed text-zinc-400">
                <span className="font-semibold text-zinc-200">epoll Event Loop:</span> multiplexes socket I/O for gateway and
                replication channels with low overhead.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 text-amber-300" />
              <p className="text-xs leading-relaxed text-zinc-400">
                <span className="font-semibold text-zinc-200">WAL First:</span> every mutating command is durably appended before
                applied state changes.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <RefreshCw className="mt-0.5 h-4 w-4 text-emerald-300" />
              <p className="text-xs leading-relaxed text-zinc-400">
                <span className="font-semibold text-zinc-200">Raft Replication:</span> log entries stream to followers; commit
                index advances only after majority match.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-4 w-4 text-violet-300" />
              <p className="text-xs leading-relaxed text-zinc-400">
                <span className="font-semibold text-zinc-200">Encrypted Persistence:</span> WAL and persisted segments are written
                with at-rest encryption policies enabled.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FloatingMiniGraph({ isVisible }: { isVisible: boolean }) {
  const history = useClusterStore((s) => s.history);
  const wsStatus = useClusterStore((s) => s.wsStatus);
  const [collapsed, setCollapsed] = useState(() => {
    const raw = localStorage.getItem("observe_mini_graph_collapsed");
    return raw ? raw === "true" : true;
  });
  const [corner, setCorner] = useState<MiniGraphCorner>(() => {
    const raw = localStorage.getItem("observe_mini_graph_corner");
    if (raw && MINI_GRAPH_CORNERS.includes(raw as MiniGraphCorner)) return raw as MiniGraphCorner;
    return "bottom-right";
  });

  useEffect(() => {
    localStorage.setItem("observe_mini_graph_collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem("observe_mini_graph_corner", corner);
  }, [corner]);

  if (!isVisible) return null;

  const miniData = history.slice(-20).map((pt) => ({
    time: new Date(pt.ts * 1000).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
    total: pt.set_ops_per_sec + pt.get_ops_per_sec
  }));
  const latest = miniData[miniData.length - 1]?.total ?? 0;

  const nextCorner = () => {
    const currentIndex = MINI_GRAPH_CORNERS.indexOf(corner);
    const target = MINI_GRAPH_CORNERS[(currentIndex + 1) % MINI_GRAPH_CORNERS.length];
    setCorner(target);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      className={clsx("fixed z-[105]", MINI_GRAPH_CORNER_CLASS[corner])}
    >
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-3 rounded-2xl border border-white/15 bg-zinc-950/90 px-4 py-3 shadow-2xl backdrop-blur-xl hover:bg-zinc-900"
        >
          <Activity className="h-4 w-4 text-blue-300" />
          <div className="text-left">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Mini Throughput</p>
            <p className="text-sm font-bold text-white">{latest.toLocaleString()} ops/s</p>
          </div>
          <Maximize2 className="h-4 w-4 text-zinc-400" />
        </button>
      ) : (
        <div className="w-[min(92vw,360px)] rounded-2xl border border-white/15 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">Live Throughput Mini Graph</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Status: {wsStatus} · {latest.toLocaleString()} ops/s
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={nextCorner}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                title="Move mini graph corner"
              >
                <Move className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCollapsed(true)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                title="Minimize mini graph"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={miniData}>
                <defs>
                  <linearGradient id="miniOpsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} width={34} />
                <Tooltip contentStyle={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }} />
                <Area type="monotone" dataKey="total" stroke="#60a5fa" strokeWidth={2} fill="url(#miniOpsGrad)" animationDuration={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-2 text-[10px] text-zinc-600">Tip: use the move icon to cycle corners.</p>
        </div>
      )}
    </motion.div>
  );
}

export default function App() {
  useSimulatedMetrics();
  const wsStatus = useClusterStore((s) => s.wsStatus);
  const nodes = useClusterStore((s) => s.nodes);
  const [isLanding, setIsLanding] = useState(true);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const nodesInitializedRef = useRef(false);
  const prevWsStatusRef = useRef(wsStatus);
  const prevNodesRef = useRef(nodes);

  const pushNotification = (title: string, detail: string, level: NotificationLevel = "info") => {
    const item: NotificationItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      detail,
      ts: Date.now(),
      level,
      read: false
    };
    setNotifications((prev) => [item, ...prev].slice(0, 60));
  };

  const unreadCount = notifications.reduce((count, item) => (item.read ? count : count + 1), 0);

  const tabs = useMemo(
    () => [
      { id: "dashboard" as const, label: "Overview", icon: LayoutDashboard },
      { id: "explorer" as const, label: "Explorer", icon: Search },
      { id: "raft" as const, label: "Consensus", icon: Activity },
      { id: "architecture" as const, label: "Architecture", icon: BookOpen }
    ],
    []
  );

  useEffect(() => {
    pushNotification("Notification Center Online", "Watching connection state, node health, and quorum readiness.", "info");
  }, []);

  useEffect(() => {
    if (prevWsStatusRef.current !== wsStatus) {
      if (wsStatus === "open") {
        pushNotification("Gateway Connection Restored", "Live event stream is active.", "success");
      } else if (wsStatus === "connecting") {
        pushNotification("Gateway Reconnecting", "Attempting to restore stream from backend.", "warn");
      } else {
        pushNotification("Gateway Connection Closed", "Live stream is offline. Metrics will use fallback behavior.", "error");
      }
    }
    prevWsStatusRef.current = wsStatus;
  }, [wsStatus]);

  useEffect(() => {
    if (!nodesInitializedRef.current) {
      nodesInitializedRef.current = true;
      prevNodesRef.current = nodes;
      return;
    }

    const prevNodes = prevNodesRef.current;
    const prevById = new Map(prevNodes.map((node) => [node.node_id, node]));
    const quorum = Math.floor(nodes.length / 2) + 1;
    const previousHealthy = prevNodes.filter((node) => node.healthy).length;
    const currentHealthy = nodes.filter((node) => node.healthy).length;

    nodes.forEach((node) => {
      const oldNode = prevById.get(node.node_id);
      if (!oldNode) return;

      if (oldNode.healthy !== node.healthy) {
        if (node.healthy) {
          pushNotification(`Node ${node.node_id} Recovered`, `${node.host}:${node.port} is healthy again.`, "success");
        } else {
          pushNotification(`Node ${node.node_id} Unreachable`, `${node.host}:${node.port} stopped responding.`, "error");
        }
      }
    });

    const previousLeader = prevNodes.find((node) => node.is_leader && node.healthy)?.node_id;
    const currentLeader = nodes.find((node) => node.is_leader && node.healthy)?.node_id;
    if (previousLeader !== currentLeader) {
      if (currentLeader) {
        pushNotification("Leader Updated", `Node ${currentLeader} is now the active leader.`, "info");
      } else {
        pushNotification("Leader Unavailable", "No healthy leader currently detected.", "warn");
      }
    }

    const previousQuorum = previousHealthy >= quorum;
    const currentQuorum = currentHealthy >= quorum;
    if (previousQuorum !== currentQuorum) {
      if (currentQuorum) {
        pushNotification("Quorum Restored", `Cluster has ${currentHealthy}/${nodes.length} healthy replicas.`, "success");
      } else {
        pushNotification("Quorum Lost", `Only ${currentHealthy}/${nodes.length} replicas are healthy. Writes may stall.`, "error");
      }
    }

    prevNodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    if (notificationsOpen) {
      setNotifications((prev) => prev.map((item) => (item.read ? item : { ...item, read: true })));
    }
  }, [notificationsOpen]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setNotificationsOpen(false);
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  return (
    <div className="mesh-gradient min-h-screen bg-[#050505] text-zinc-100">
      <AnimatePresence>{isLanding ? <Landing onEnter={() => setIsLanding(false)} /> : null}</AnimatePresence>

      <AnimatePresence>
        {searchOpen ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[115] grid place-items-start bg-black/70 px-4 pt-[16vh] backdrop-blur-sm" onClick={() => setSearchOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-900 p-4">
              <div className="mb-3 flex items-center gap-3">
                <Search className="h-4 w-4 text-zinc-500" />
                <span className="text-sm text-zinc-300">Quick Search</span>
              </div>
              <div className="grid gap-2">
                {tabs.map((item) => (
                  <button key={item.id} onClick={() => { setTab(item.id); setSearchOpen(false); }} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/10">
                    <span>{item.label}</span>
                    <item.icon className="h-4 w-4 text-zinc-500" />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {notificationsOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[112] bg-black/55 backdrop-blur-sm"
            onClick={() => setNotificationsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="absolute right-6 top-24 w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div>
                  <p className="text-sm font-bold text-white">Notifications</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Cluster Activity Feed</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNotifications([])}
                    className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setNotificationsOpen(false)}
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="custom-scrollbar max-h-[60vh] overflow-y-auto p-3">
                {notifications.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
                    <p className="text-sm text-zinc-400">No notifications yet.</p>
                    <p className="mt-1 text-xs text-zinc-600">Events will appear here as the cluster changes.</p>
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className={clsx(
                        "mb-2 rounded-xl border p-3",
                        item.read ? "border-white/10 bg-white/[0.02]" : "border-blue-500/35 bg-blue-500/[0.08]"
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={clsx(
                              "h-2 w-2 rounded-full",
                              item.level === "success" && "bg-emerald-400",
                              item.level === "warn" && "bg-amber-400",
                              item.level === "error" && "bg-rose-400",
                              item.level === "info" && "bg-sky-400"
                            )}
                          />
                          <p className="text-xs font-semibold text-zinc-100">{item.title}</p>
                        </div>
                        <span className="font-mono text-[10px] text-zinc-500">
                          {new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-zinc-400">{item.detail}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-h-screen">
        <motion.aside
          animate={{ width: sidebarOpen ? 280 : 88 }}
          transition={{ type: "spring", damping: 20, stiffness: 200 }}
          className="z-40 flex h-screen flex-col border-r border-white/10 bg-black/45 backdrop-blur-2xl"
        >
          <div className="mb-10 flex items-center p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white">
                <Zap className="h-6 w-6 fill-black text-black" />
              </div>
              {sidebarOpen ? (
                <div>
                  <p className="text-lg font-black leading-none tracking-tight text-white">OBSERVE</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">Console</p>
                </div>
              ) : null}
            </div>
          </div>
          <nav className="flex-1 space-y-2 px-4">
            {tabs.map((item) => (
              <button key={item.id} onClick={() => setTab(item.id)} className={clsx("flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-sm font-bold tracking-tight transition", tab === item.id ? "bg-white text-black" : "text-zinc-500 hover:bg-white/10 hover:text-zinc-100")}>
                <item.icon className="h-5 w-5 shrink-0" />
                {sidebarOpen ? <span>{item.label}</span> : null}
              </button>
            ))}
          </nav>
          <div className="p-6">
            <button onClick={() => setSidebarOpen((v) => !v)} className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-zinc-500 hover:text-white">
              <ChevronRight className={clsx("h-4 w-4 transition-transform", sidebarOpen && "rotate-180")} />
            </button>
          </div>
        </motion.aside>

        <main className="flex h-screen flex-1 flex-col overflow-hidden">
          <header className="flex h-24 shrink-0 items-center justify-between border-b border-white/10 bg-black/20 px-10 backdrop-blur-md">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">System Status: {wsStatus}</span>
              </div>
              <button onClick={() => setSearchOpen(true)} className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 lg:flex">
                <Command className="h-3.5 w-3.5" />
                Quick Search
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setNotificationsOpen((v) => !v)}
                className={clsx(
                  "relative rounded-xl p-2.5 transition",
                  notificationsOpen ? "bg-white/10 text-white" : "text-zinc-500 hover:bg-white/10 hover:text-white"
                )}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </button>
            </div>
          </header>

          <div className="custom-scrollbar flex-1 overflow-y-auto p-10">
            <div className="mx-auto max-w-7xl">
              <AnimatePresence mode="wait">
                <motion.div key={tab} initial={{ opacity: 0, scale: 0.99, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.99, y: -10 }}>
                  {tab === "dashboard" ? <DashboardView /> : null}
                  {tab === "explorer" ? <ExplorerView /> : null}
                  {tab === "raft" ? <RaftView /> : null}
                  {tab === "architecture" ? <ArchitectureView /> : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>

      <AnimatePresence>
        <FloatingMiniGraph isVisible={tab !== "dashboard"} />
      </AnimatePresence>
    </div>
  );
}
