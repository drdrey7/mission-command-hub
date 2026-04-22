import { Radio, Crown, Shield, Workflow, BookOpen, Cpu, LucideIcon } from "lucide-react";
import { recentActivity, ActivityEvent } from "@/data/mockData";
import { cn } from "@/lib/utils";

const agentMeta: Record<ActivityEvent["agent"], { icon: LucideIcon; color: string }> = {
  comandante: { icon: Crown, color: "text-agent-comandante" },
  cyber: { icon: Shield, color: "text-agent-cyber" },
  flow: { icon: Workflow, color: "text-agent-flow" },
  ledger: { icon: BookOpen, color: "text-agent-ledger" },
  sistema: { icon: Cpu, color: "text-muted-foreground" },
};

export const RecentActivityPanel = () => {
  return (
    <div className="panel flex h-full flex-col p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-surface-2">
            <Radio className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
              Atividade Recente
            </h2>
            <p className="text-xs text-muted-foreground">Eventos operacionais ao vivo</p>
          </div>
        </div>
        <button className="text-xs uppercase tracking-wider text-muted-foreground transition-smooth hover:text-accent">
          Ver tudo
        </button>
      </div>

      <ul className="mt-5 space-y-1">
        {recentActivity.map((event, idx) => {
          const meta = agentMeta[event.agent];
          const Icon = meta.icon;
          return (
            <li
              key={event.id}
              className="group relative flex items-start gap-3 rounded-lg border border-transparent p-3 transition-smooth hover:border-border/60 hover:bg-surface-2/40"
            >
              {/* Timeline line */}
              {idx < recentActivity.length - 1 && (
                <span className="absolute left-[26px] top-12 h-4 w-px bg-border/60" />
              )}
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-surface-2",
                  meta.color
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{event.text}</p>
                <p className={cn("mt-0.5 text-xs lowercase", meta.color)}>{event.agent}</p>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{event.time}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
