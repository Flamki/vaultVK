import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  ChevronRight,
  Command,
  Database,
  LayoutDashboard,
  Power,
  RefreshCw,
  Search,
  Server,
  Settings,
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
      <h2 className="text-gradient text-5xl font-extrabold tracking-tight">Key Explorer</h2>
      <div className="glass rounded-[2rem] p-6">
        <div className="mb-5 flex flex-wrap gap-2">
          {(["GET", "SET", "DEL", "SCAN"] as const).map((it) => (
            <button key={it} onClick={() => setOp(it)} className={clsx("rounded-xl px-4 py-2 font-mono text-xs uppercase tracking-[0.18em]", op === it ? "bg-white text-black" : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200")}>
              {it}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 lg:flex-row">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={op === "SCAN" ? "prefix..." : "key"} className="flex-1 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 font-mono text-sm text-zinc-100 outline-none" />
          {op === "SET" ? <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" className="flex-1 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 font-mono text-sm text-zinc-100 outline-none" /> : null}
          <button onClick={() => void execute()} className="rounded-xl bg-blue-600 px-8 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white hover:bg-blue-500">
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
              {rows.map((r, i) => (
                <tr key={`${r.key}-${i}`} className="border-t border-white/10 text-sm">
                  <td className="px-4 py-3 font-mono text-amber-300">{r.op}</td>
                  <td className="px-4 py-3 font-mono text-sky-300">{r.key}</td>
                  <td className="max-w-[320px] truncate px-4 py-3 text-zinc-300">{r.result}</td>
                  <td className="px-4 py-3 text-right font-mono text-purple-300">{r.latency}</td>
                  <td className={clsx("px-4 py-3 text-center font-mono text-xs", r.ok ? "text-emerald-300" : "text-rose-300")}>
                    {r.ok ? "OK" : "ERR"}
                  </td>
                </tr>
              ))}
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
  return (
    <div className="space-y-8">
      <h2 className="text-gradient text-5xl font-extrabold tracking-tight">VaultKV Architecture</h2>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Frontend", value: "React + Motion" },
          { label: "Gateway", value: "FastAPI TLV Bridge" },
          { label: "Engine", value: "C++17 + epoll" },
          { label: "Consensus", value: "Raft + Quorum ACK" }
        ].map((c) => (
          <div key={c.label} className="glass rounded-2xl p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{c.label}</p>
            <p className="mt-2 text-lg font-semibold text-white">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="glass rounded-2xl p-6">
        <p className="text-zinc-400">
          Client requests reach FastAPI, are translated into TLV frames, committed through leader WAL replication,
          and acknowledged after majority quorum.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  useSimulatedMetrics();
  const wsStatus = useClusterStore((s) => s.wsStatus);
  const [isLanding, setIsLanding] = useState(true);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);

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
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") setSearchOpen(false);
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
              <button className="rounded-xl p-2.5 text-zinc-500 hover:bg-white/10 hover:text-white">
                <Bell className="h-5 w-5" />
              </button>
              <button className="rounded-xl p-2.5 text-zinc-500 hover:bg-white/10 hover:text-white">
                <Settings className="h-5 w-5" />
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
    </div>
  );
}
