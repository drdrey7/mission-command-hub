import { cn } from "@/lib/utils";
import { Agent } from "@/data/mockData";
import { StatusBadge } from "./StatusBadge";
import { Crown, Shield, Workflow, BookOpen, LucideIcon } from "lucide-react";

const agentConfig: Record<
  Agent["key"],
  { icon: LucideIcon; color: string; glow: string; ring: string; bg: string }
> = {
  comandante: {
    icon: Crown,
    color: "text-agent-comandante",
    glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-comandante)/0.5)]",
    ring: "from-agent-comandante/40",
    bg: "bg-agent-comandante/10",
  },
  cyber: {
    icon: Shield,
    color: "text-agent-cyber",
    glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-cyber)/0.5)]",
    ring: "from-agent-cyber/40",
    bg: "bg-agent-cyber/10",
  },
  flow: {
    icon: Workflow,
    color: "text-agent-flow",
    glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-flow)/0.5)]",
    ring: "from-agent-flow/40",
    bg: "bg-agent-flow/10",
  },
  ledger: {
    icon: BookOpen,
    color: "text-agent-ledger",
    glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-ledger)/0.5)]",
    ring: "from-agent-ledger/40",
    bg: "bg-agent-ledger/10",
  },
};

interface AgentCardProps {
  agent: Agent;
}

export const AgentCard = ({ agent }: AgentCardProps) => {
  const cfg = agentConfig[agent.key];
  const Icon = cfg.icon;
  const isActive = agent.status === "active";

  return (
    <div
      className={cn(
        "panel group relative overflow-hidden p-5 transition-smooth hover:-translate-y-1",
        isActive && cfg.glow
      )}
    >
      {/* Decorative gradient ring */}
      <div
        className={cn(
          "pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-radial blur-2xl opacity-60",
          cfg.bg
        )}
      />

      {/* Top: icon + status */}
      <div className="relative flex items-start justify-between">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl border border-border/60",
            cfg.bg
          )}
        >
          <Icon className={cn("h-6 w-6", cfg.color)} strokeWidth={2} />
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Name + role */}
      <div className="relative mt-5">
        <h3 className={cn("font-display text-2xl font-bold lowercase tracking-tight", cfg.color)}>
          {agent.name}
        </h3>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {agent.role}
        </p>
      </div>

      {/* Stats */}
      <div className="relative mt-6 grid grid-cols-2 gap-3 border-t border-border/60 pt-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sessões</p>
          <p className="font-mono text-lg font-semibold text-foreground">{agent.sessions}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Última atividade</p>
          <p className="font-mono text-sm font-medium text-foreground">{agent.lastActivity}</p>
        </div>
      </div>

      {/* Bottom scanline */}
      {isActive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden">
          <div className={cn("scanline h-px w-1/3 bg-gradient-to-r from-transparent via-current to-transparent", cfg.color)} />
        </div>
      )}
    </div>
  );
};
