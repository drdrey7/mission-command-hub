import { cn } from "@/lib/utils";
import { Agent } from "@/data/mockData";
import { StatusBadge } from "./StatusBadge";
import { AgentBadge, FlightTimer } from "./AgentBadge";

const tone: Record<Agent["key"], { color: string; glow: string; bg: string }> = {
  comandante: {
    color: "text-agent-comandante",
    glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-comandante)/0.5)]",
    bg: "bg-agent-comandante/10",
  },
  cyber: {
    color: "text-agent-cyber",
    glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-cyber)/0.5)]",
    bg: "bg-agent-cyber/10",
  },
  flow: {
    color: "text-agent-flow",
    glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-flow)/0.5)]",
    bg: "bg-agent-flow/10",
  },
  ledger: {
    color: "text-agent-ledger",
    glow: "shadow-[0_0_50px_-10px_hsl(var(--agent-ledger)/0.5)]",
    bg: "bg-agent-ledger/10",
  },
};

interface AgentCardProps {
  agent: Agent;
}

export const AgentCard = ({ agent }: AgentCardProps) => {
  const cfg = tone[agent.key];
  const isWorking = agent.status === "working";
  const isLit = isWorking || agent.status === "active";

  return (
    <div
      className={cn(
        "panel group relative overflow-hidden p-5 transition-smooth hover:-translate-y-1",
        isLit && cfg.glow
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full blur-2xl opacity-60",
          cfg.bg
        )}
      />

      <div className="relative flex items-start justify-between">
        <AgentBadge agent={agent.key} working={isWorking} size="md" />
        <StatusBadge status={agent.status} />
      </div>

      <div className="relative mt-5">
        <h3 className={cn("font-display text-2xl font-bold lowercase tracking-tight", cfg.color)}>
          {agent.name}
        </h3>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {agent.role}
        </p>
      </div>

      {isWorking && agent.flightStartedAt && (
        <div className="relative mt-4 flex items-center justify-between rounded-lg border border-border/60 bg-surface-2/60 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Tempo de voo
            </p>
            <p className="truncate text-xs text-foreground">{agent.currentTask}</p>
          </div>
          <FlightTimer
            startedAt={agent.flightStartedAt}
            className={cn("text-base font-bold", cfg.color)}
          />
        </div>
      )}

      <div className="relative mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sessões</p>
          <p className="font-mono text-lg font-semibold text-foreground">{agent.sessions}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Última atividade</p>
          <p className="font-mono text-sm font-medium text-foreground">{agent.lastActivity}</p>
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
