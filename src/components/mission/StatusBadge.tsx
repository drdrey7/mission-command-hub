import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/data/mockData";

type SystemStatus = "online" | "warning" | "offline";

interface StatusBadgeProps {
  status: AgentStatus | SystemStatus;
  label?: string;
  className?: string;
}

const statusMap: Record<string, { color: string; text: string; label: string }> = {
  // System
  online:    { color: "bg-status-online",     text: "text-status-online",     label: "Online" },
  warning:   { color: "bg-status-warning",    text: "text-status-warning",    label: "Atenção" },
  offline:   { color: "bg-status-offline",    text: "text-status-offline",    label: "Offline" },
  // Agents (aviation)
  em_voo:    { color: "bg-status-online",     text: "text-status-online",     label: "Em Voo" },
  taxiing:   { color: "bg-status-warning",    text: "text-status-warning",    label: "Taxiing" },
  on_ground: { color: "bg-agent-cyber",       text: "text-agent-cyber",       label: "On Ground" },
  hangar:    { color: "bg-muted-foreground",  text: "text-muted-foreground",  label: "Hangar" },
};

export const StatusBadge = ({ status, label, className }: StatusBadgeProps) => {
  const cfg = statusMap[status] ?? statusMap.hangar;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface-1/80 px-3 py-1 text-xs font-medium uppercase tracking-wider",
        cfg.text,
        className
      )}
    >
      <span className={cn("pulse-dot inline-block h-1.5 w-1.5 rounded-full", cfg.color)} />
      {label ?? cfg.label}
    </div>
  );
};
