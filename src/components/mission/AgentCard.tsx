import { cn } from "@/lib/utils";
import { Agent } from "@/data/mockData";
import { StatusBadge } from "./StatusBadge";
import { AgentBadge, FlightTimer } from "./AgentBadge";

const tone: Record<Agent["key"], { color: string; glow: string; bg: string }> = {
  comandante: { color: "text-agent-comandante", glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-comandante)/0.5)]", bg: "bg-agent-comandante/10" },
  cyber:      { color: "text-agent-cyber",      glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-cyber)/0.5)]",      bg: "bg-agent-cyber/10" },
  flow:       { color: "text-agent-flow",       glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-flow)/0.5)]",       bg: "bg-agent-flow/10" },
  ledger:     { color: "text-agent-ledger",     glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-ledger)/0.5)]",     bg: "bg-agent-ledger/10" },
};

export const AgentCard = ({ agent }: { agent: Agent }) => {
  const cfg = tone[agent.key];
  const isActive = agent.status === "active" || agent.status === "working";
  const isWorking = agent.status === "working";
  const isLit = isActive;

  return (
    <div className={cn("panel group relative overflow-hidden p-4 transition-smooth hover:-translate-y-0.5", isLit && cfg.glow)}>
      <div className={cn("pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-2xl opacity-60", cfg.bg)} />

      <div className="relative flex items-center justify-between">
        <AgentBadge agent={agent.key} working={isActive} size="md" />
        <StatusBadge status={agent.status} />
      </div>

      <div className="relative mt-3">
        <h3 className={cn("font-display text-xl font-bold lowercase tracking-tight", cfg.color)}>
          {agent.name}
        </h3>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{agent.role}</p>
      </div>

      <div className="relative mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            <span className="font-mono font-semibold text-foreground tabular-nums">{agent.sessions}</span> sessões
          </span>
          {isWorking && agent.flightStartedAt ? (
            <FlightTimer startedAt={agent.flightStartedAt} className={cn("text-xs font-bold tabular-nums", cfg.color)} />
          ) : (
            <span className="text-muted-foreground tabular-nums">{agent.lastActivity}</span>
          )}
        </div>
      </div>

      {isLit && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden">
          <div className={cn("scanline h-px w-1/3 bg-gradient-to-r from-transparent via-current to-transparent", cfg.color)} />
        </div>
      )}
    </div>
  );
};
