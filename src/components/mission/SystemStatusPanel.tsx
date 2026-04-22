import { Activity, Server } from "lucide-react";
import { systemMetrics } from "@/data/mockData";
import { StatusBadge } from "./StatusBadge";

export const SystemStatusPanel = () => {
  return (
    <div className="panel flex h-full flex-col p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-surface-2">
            <Activity className="h-5 w-5 text-status-online" />
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
              Estado do Sistema
            </h2>
            <p className="text-xs text-muted-foreground">Openclaw infraestrutura VPS</p>
          </div>
        </div>
        <StatusBadge status="online" label="Operacional" />
      </div>

      <div className="my-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {systemMetrics.map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-border/40 bg-surface-2/50 p-3"
          >
            <div className="flex items-center gap-1.5">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-status-online text-status-online" />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
            </div>
            <p className="mt-1.5 font-mono text-lg font-bold text-foreground">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Uptime block */}
      <div className="mt-auto rounded-xl border border-border/60 bg-gradient-to-br from-status-online/10 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-status-online" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Uptime do sistema</p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">30 dias</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-bold text-status-online">99.98%</span>
          <span className="text-xs text-muted-foreground">disponibilidade</span>
        </div>
        {/* Mini sparkline */}
        <svg viewBox="0 0 200 32" className="mt-2 h-8 w-full">
          <polyline
            fill="none"
            stroke="hsl(var(--status-online))"
            strokeWidth="1.5"
            points="0,22 20,18 40,20 60,12 80,16 100,8 120,14 140,6 160,10 180,4 200,8"
          />
          <polyline
            fill="hsl(var(--status-online) / 0.15)"
            stroke="none"
            points="0,22 20,18 40,20 60,12 80,16 100,8 120,14 140,6 160,10 180,4 200,8 200,32 0,32"
          />
        </svg>
      </div>
    </div>
  );
};
