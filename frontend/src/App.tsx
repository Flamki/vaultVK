import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { ChevronRight, Command, LayoutDashboard, Search, Activity, Zap } from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";

import { useClusterWS } from "./hooks/useClusterWS";
import { Dashboard } from "./pages/Dashboard";
import { Explorer } from "./pages/Explorer";
import { Raft } from "./pages/Raft";
import { useClusterStore } from "./store/clusterStore";

function LandingPage({ onEnter }: { onEnter: () => void }) {
  const [isHovering, setIsHovering] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { damping: 30, stiffness: 150, mass: 0.5 });
  const springY = useSpring(mouseY, { damping: 30, stiffness: 150, mass: 0.5 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: "blur(20px)", transition: { duration: 0.65 } }}
      className="fixed inset-0 z-[200] flex cursor-none flex-col items-center justify-center overflow-hidden bg-[#020202]"
    >
      <motion.div
        style={{ x: springX, y: springY, translateX: "-50%", translateY: "-50%" }}
        className="pointer-events-none absolute h-[700px] w-[700px] rounded-full bg-blue-600/10 blur-[120px]"
      />
      <div className="pointer-events-none absolute inset-0 mesh-gradient opacity-40" />

      <div className="relative z-10 flex max-w-[1200px] flex-col items-center px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <p className="mb-6 font-mono text-[11px] font-semibold uppercase tracking-[0.6em] text-zinc-500">
            Secure Protocol Initialized
          </p>
        </motion.div>

        <motion.h1
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          animate={{ skewX: isHovering ? -10 : -6, scale: isHovering ? 1.05 : 1 }}
          className="text-[20vw] font-black uppercase leading-[0.74] tracking-[-0.11em] text-white md:text-[14vw]"
        >
          OBSERVE
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-8 max-w-3xl text-xl leading-tight text-zinc-400"
        >
          A high-fidelity control plane for distributed storage. Real-time telemetry, cluster orchestration, and
          consensus operations in one interface.
        </motion.p>

        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={onEnter}
          className="mt-12 inline-flex items-center gap-4 rounded-full bg-white px-10 py-5 text-sm font-black uppercase tracking-[0.35em] text-black transition hover:bg-zinc-200"
        >
          Initialize <Zap className="h-5 w-5 fill-current" />
        </motion.button>

        <div className="mt-10 flex items-center gap-8 text-[11px] font-mono text-zinc-500">
          <span>AES-256-GCM</span>
          <span>99.999%</span>
          <span>GLOBAL-01</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function App() {
  useClusterWS();
  const wsStatus = useClusterStore((s) => s.wsStatus);
  const [isLanding, setIsLanding] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  const navItems = [
    { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/explorer", label: "Explorer", icon: Search, end: false },
    { to: "/raft", label: "Consensus", icon: Activity, end: false }
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 mesh-gradient">
      <AnimatePresence mode="wait">{isLanding ? <LandingPage onEnter={() => setIsLanding(false)} /> : null}</AnimatePresence>

      <div className="flex min-h-screen">
        <motion.aside
          initial={false}
          animate={{ width: isSidebarOpen ? 280 : 88 }}
          transition={{ type: "spring", damping: 20, stiffness: 200 }}
          className="z-40 flex h-screen flex-col border-r border-white/10 bg-black/45 backdrop-blur-2xl"
        >
          <div className="mb-10 flex items-center p-8">
            <div className="flex cursor-pointer items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-2xl shadow-white/20">
                <Zap className="h-6 w-6 fill-black text-black" />
              </div>
              {isSidebarOpen ? (
                <div className="flex flex-col">
                  <span className="text-lg font-black leading-none tracking-tight text-white">OBSERVE</span>
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">Console</span>
                </div>
              ) : null}
            </div>
          </div>

          <nav className="flex-1 space-y-2 px-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `group relative flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-sm font-bold tracking-tight transition ${
                    isActive ? "bg-white text-black" : "text-zinc-500 hover:bg-white/10 hover:text-zinc-100"
                  }`
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {isSidebarOpen ? <span>{item.label}</span> : null}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-4 p-6">
            {isSidebarOpen ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-2 flex justify-between text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  <span>Cluster Load</span>
                  <span className="text-emerald-400">Optimal</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                  <motion.div initial={{ width: 0 }} animate={{ width: "42%" }} className="h-full bg-emerald-500" />
                </div>
              </div>
            ) : null}

            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-zinc-500 transition hover:text-white"
            >
              <ChevronRight className={`h-4 w-4 transition-transform duration-500 ${isSidebarOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        </motion.aside>

        <main className="flex h-screen flex-1 flex-col overflow-hidden">
          <header className="flex h-24 shrink-0 items-center justify-between border-b border-white/10 bg-black/20 px-10 backdrop-blur-md">
            <div className="flex items-center gap-6">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-500">System Status: {wsStatus}</span>
              <button className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 lg:flex">
                <Command className="h-3.5 w-3.5" />
                Quick Search
              </button>
            </div>
          </header>

          <div className="custom-scrollbar flex-1 overflow-y-auto p-10">
            <div className="mx-auto max-w-7xl">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/explorer" element={<Explorer />} />
                <Route path="/raft" element={<Raft />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
