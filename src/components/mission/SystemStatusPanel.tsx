import { useEffect, useState } from "react";
import { Activity, Server, Shield, ChevronRight } from "lucide-react";
import { systemMetrics } from "@/data/mockData";
import { StatusBadge } from "./StatusBadge";
import { getFail2banStats } from "@/services/api";

interface Props { onSeeFail2ban?: () => void; }

export const SystemStatusPanel = ({ onSeeFail2ban }: Props) => {
  const [banned, setBanned] = useState<number | null>(null);
  useEffect(() => { getFail2banStats().then((s) => setBanned(s.totalBanned)); }, []);

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface-2">
            <Activity className="h-4 w-4 text-status-online" />
          </div>
          <div>
            <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
              Estado do sistema
            </h2>
            <p className="text-[11px] text-muted-foreground">VPS · Lisboa</p>
          </div>
        </div>
        <StatusBadge status="online" label="OK" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {systemMetrics.slice(0, 3).map((m) => (
          <div key={m.label} className="rounded-lg border border-border/40 bg-surface-2/50 p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="pulse-dot inline-block h-1 w-1 rounded-full bg-status-online text-status-online" />
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
            </div>
            <p className="mt-1 font-mono text-sm font-bold text-foreground tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-border/60 bg-gradient-to-br from-status-online/10 to-transparent p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Server className="h-3 w-3 text-status-online" /> Uptime
          </span>
          <span className="font-mono text-lg font-bold text-status-online tabular-nums">99.98%</span>
        </div>
        <svg viewBox="0 0 200 24" className="mt-1.5 h-6 w-full">
          <polyline fill="none" stroke="hsl(var(--status-online))" strokeWidth="1.5"
            points="0,18 20,14 40,16 60,8 80,12 100,4 120,10 140,2 160,6 180,2 200,4" />
          <polyline fill="hsl(var(--status-online) / 0.15)" stroke="none"
            points="0,18 20,14 40,16 60,8 80,12 100,4 120,10 140,2 160,6 180,2 200,4 200,24 0,24" />
        </svg>
      </div>

      <button
        onClick={onSeeFail2ban}
        className="mt-3 flex items-center justify-between rounded-lg border border-status-offline/30 bg-status-offline/5 p-3 text-left transition-smooth hover:border-status-offline/50 hover:bg-status-offline/10"
      >
        <div className="flex items-center gap-2.5">
          <Shield className="h-4 w-4 text-status-offline" />
          <div>
            <p className="text-xs font-semibold text-foreground">Fail2ban ativo</p>
            <p className="text-[10px] text-muted-foreground">
              {banned !== null ? `${banned} IPs banidos agora` : "a carregar…"}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
};
