import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import { getAgents, getTasks, getAuditTrail, getFail2banStats } from "@/services/api";
import { cn } from "@/lib/utils";

interface Kpi {
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger";
}

export const Hero = () => {
  const [kpis, setKpis] = useState<Kpi[]>([
    { label: "Agentes ativos", value: "—" },
    { label: "Tarefas", value: "—" },
    { label: "Eventos 24h", value: "—" },
    { label: "IPs banidos", value: "—" },
  ]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [agents, tasks, activity, fail2ban] = await Promise.all([
          getAgents(),
          getTasks(),
          getAuditTrail(500),
          getFail2banStats(),
        ]);
        if (cancelled) return;
        const active = agents.filter((a) => a.status === "em_voo" || a.status === "taxiing").length;
        const banned = fail2ban.currentBannedCount ?? fail2ban.bannedCount ?? fail2ban.totalBanned;
        setKpis([
          { label: "Agentes ativos", value: String(active).padStart(2, "0") },
          { label: "Tarefas", value: String(tasks.summary.total).padStart(2, "0") },
          { label: "Eventos 24h", value: String(activity.length), tone: activity.length > 100 ? "warning" : "default" },
          { label: "IPs banidos", value: banned === null ? "—" : String(banned), tone: (banned ?? 0) > 0 ? "danger" : "default" },
        ]);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar KPI");
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
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

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {kpis.map((k) => {
            const valueCls = k.tone === "danger" ? "text-status-offline" : k.tone === "warning" ? "text-status-warning" : "text-foreground";
            return (
              <div key={k.label} className="rounded-lg border border-border/60 bg-surface-2/60 px-3 py-2 backdrop-blur min-w-[120px]">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground leading-none">{k.label}</p>
                <p className={cn("mt-1 font-mono text-xl font-bold tabular-nums leading-none", valueCls)}>{k.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="relative mt-4 rounded-xl border border-status-offline/30 bg-status-offline/5 px-4 py-3 text-sm text-status-offline">
          {error}
        </div>
      )}
    </section>
  );
};
