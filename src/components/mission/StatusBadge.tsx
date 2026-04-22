import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "online" | "warning" | "offline" | "active" | "standby" | "idle";
  label?: string;
  className?: string;
}

const statusMap = {
  online: { color: "bg-status-online", text: "text-status-online", label: "Online" },
  active: { color: "bg-status-online", text: "text-status-online", label: "Em Operação" },
  warning: { color: "bg-status-warning", text: "text-status-warning", label: "Atenção" },
  standby: { color: "bg-status-warning", text: "text-status-warning", label: "Aguardando" },
  offline: { color: "bg-status-offline", text: "text-status-offline", label: "Offline" },
  idle: { color: "bg-muted-foreground", text: "text-muted-foreground", label: "Inativo" },
};

export const StatusBadge = ({ status, label, className }: StatusBadgeProps) => {
  const cfg = statusMap[status];
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
