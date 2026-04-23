import { useEffect, useState } from "react";
import { Activity, Server, Shield, ChevronRight, Cpu, MemoryStick, HardDrive } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { getVpsNodes } from "@/services/api";
import type { VpsNode } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface Props { onSeeFail2ban?: () => void; onSeeVps?: () => void }

const Bar = ({ value, tone }: { value: number; tone: "ok" | "warn" | "bad" }) => {
  const color = tone === "bad" ? "bg-status-offline" : tone === "warn" ? "bg-status-warning" : "bg-status-online";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
};

const toneFor = (v: number): "ok" | "warn" | "bad" => v > 85 ? "bad" : v > 65 ? "warn" : "ok";

export const SystemStatusPanel = ({ onSeeFail2ban, onSeeVps }: Props) => {
  const [node, setNode] = useState<VpsNode | null>(null);
  useEffect(() => { getVpsNodes().then((n) => setNode(n[0] ?? null)); }, []);

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface-2">
            <Activity className="h-4 w-4 text-status-online" />
          </div>
          <div>
            <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
              VPS · {node?.name ?? "—"}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {node ? `Uptime ${node.uptime}` : "a carregar…"}
            </p>
          </div>
        </div>
        <StatusBadge status={node?.status ?? "offline"} />
      </div>

      <div className="mt-4 space-y-2.5">
        {[
          { icon: Cpu, label: "CPU", value: node?.cpu ?? 0, raw: node ? `${node.cpu.toFixed(1)}%` : "—" },
          { icon: MemoryStick, label: "RAM", value: node?.ram ?? 0, raw: node?.ramRaw ?? "—" },
          { icon: HardDrive, label: "Disco", value: node?.disk ?? 0, raw: node ? `${node.disk}%` : "—" },
        ].map((m) => {
          const Icon = m.icon;
          const tone = node ? toneFor(m.value) : "ok";
          return (
            <div key={m.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="h-3 w-3" /> {m.label}
                </span>
                <span className="font-mono text-foreground tabular-nums">{m.raw}</span>
              </div>
              <Bar value={m.value} tone={tone} />
            </div>
          );
        })}
      </div>

      <button
        onClick={onSeeVps}
        className="mt-4 flex items-center justify-between rounded-lg border border-border/60 bg-surface-2/40 p-2.5 text-left text-xs transition-smooth hover:border-border hover:bg-surface-2"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <Server className="h-3.5 w-3.5" />
          {node?.containers?.length ?? 0} containers
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      <button
        onClick={onSeeFail2ban}
        className={cn(
          "mt-2 flex items-center justify-between rounded-lg border p-3 text-left transition-smooth",
          (node?.banned ?? 0) > 0
            ? "border-status-offline/30 bg-status-offline/5 hover:border-status-offline/50 hover:bg-status-offline/10"
            : "border-border/60 bg-surface-2/40 hover:border-border hover:bg-surface-2"
        )}
      >
        <div className="flex items-center gap-2.5">
          <Shield className={cn("h-4 w-4", (node?.banned ?? 0) > 0 ? "text-status-offline" : "text-muted-foreground")} />
          <div>
            <p className="text-xs font-semibold text-foreground">Fail2ban</p>
            <p className="text-[10px] text-muted-foreground">
              {node === null ? "a carregar…" : node.banned > 0 ? `${node.banned} IPs banidos agora` : "Nenhum IP banido actualmente"}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
};
