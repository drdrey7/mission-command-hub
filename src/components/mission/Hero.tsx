import { useEffect, useState } from "react";
import { Plane, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getMissions, getTasks, getNotifications, getFail2banStats } from "@/services/api";
import { cn } from "@/lib/utils";

interface Kpi {
  label: string;
  value: string;
  delta?: { value: string; dir: "up" | "down" | "flat"; good: boolean };
  tone?: "default" | "warning" | "danger";
}

const Delta = ({ d }: { d: NonNullable<Kpi["delta"]> }) => {
  const Icon = d.dir === "up" ? TrendingUp : d.dir === "down" ? TrendingDown : Minus;
  const cls = d.good ? "text-status-online" : "text-status-offline";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-mono", cls)}>
      <Icon className="h-3 w-3" /> {d.value}
    </span>
  );
};

export const Hero = () => {
  const [kpis, setKpis] = useState<Kpi[]>([
    { label: "Missões em voo", value: "—" },
    { label: "Tarefas hoje", value: "—" },
    { label: "Eventos 24h", value: "—" },
    { label: "IPs banidos", value: "—" },
  ]);

  useEffect(() => {
    Promise.all([getMissions(), getTasks(), getNotifications(), getFail2banStats()]).then(
      ([missions, tasks, notifs, f2b]) => {
        const inFlight = missions.filter((m) => m.status === "em_voo").length;
        setKpis([
          { label: "Missões em voo", value: String(inFlight).padStart(2, "0"), delta: { value: "+1", dir: "up", good: true } },
          { label: "Tarefas hoje", value: String(tasks.length).padStart(2, "0"), delta: { value: "-2", dir: "down", good: true } },
          { label: "Eventos 24h", value: String(notifs.length * 47), delta: { value: "+12%", dir: "up", good: false }, tone: "warning" },
          { label: "IPs banidos", value: String(f2b.totalBanned), delta: { value: `+${f2b.bannedLast24h}`, dir: "up", good: false }, tone: "danger" },
        ]);
      }
    );
  }, []);

  return (
    <section className="relative overflow-hidden rounded-[var(--radius)] border border-border bg-surface-1/60 p-5 sm:p-6">
      <div className="grid-bg absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute -top-20 left-1/3 h-[200px] w-[400px] -translate-x-1/2 rounded-full bg-agent-comandante/15 blur-[100px]" />
      <Plane className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rotate-[25deg] text-foreground/[0.04]" strokeWidth={1} />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Bem-vindo de volta, Comandante
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            <span className="text-gradient-gold">Mission</span> Control
          </h1>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {kpis.map((k) => {
            const valueCls = k.tone === "danger" ? "text-status-offline" : k.tone === "warning" ? "text-status-warning" : "text-foreground";
            return (
              <div key={k.label} className="rounded-lg border border-border/60 bg-surface-2/60 px-3 py-2 backdrop-blur min-w-[120px]">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground leading-none">{k.label}</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <p className={cn("font-mono text-xl font-bold tabular-nums leading-none", valueCls)}>{k.value}</p>
                  {k.delta && <Delta d={k.delta} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
