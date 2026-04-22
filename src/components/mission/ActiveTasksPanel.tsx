import { ClipboardList, ChevronRight } from "lucide-react";
import { tasks, Task } from "@/data/mockData";
import { cn } from "@/lib/utils";

const agentColor: Record<Task["agent"], string> = {
  comandante: "text-agent-comandante",
  cyber: "text-agent-cyber",
  flow: "text-agent-flow",
  ledger: "text-agent-ledger",
};

const priorityStyle: Record<Task["priority"], string> = {
  alta: "bg-status-offline/10 text-status-offline border-status-offline/30",
  média: "bg-status-warning/10 text-status-warning border-status-warning/30",
  baixa: "bg-muted/40 text-muted-foreground border-border",
};

interface Props { onSeeAll?: () => void; }

export const ActiveTasksPanel = ({ onSeeAll }: Props) => {
  const top = tasks.slice(0, 3);
  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface-2">
            <ClipboardList className="h-4 w-4 text-agent-comandante" />
          </div>
          <div>
            <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
              Próximas tarefas
            </h2>
            <p className="text-[11px] text-muted-foreground">Top {top.length} de {tasks.length} hoje</p>
          </div>
        </div>
        <button
          onClick={onSeeAll}
          className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground transition-smooth hover:text-foreground"
        >
          ver tudo <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-4 flex-1 space-y-2">
        {top.map((t) => (
          <div key={t.id} className="group flex items-center gap-3 rounded-lg border border-border/40 bg-surface-2/40 p-2.5 transition-smooth hover:border-border hover:bg-surface-2">
            <div className={cn("h-2 w-2 rounded-full", agentColor[t.agent].replace("text-", "bg-"))} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
              <p className={cn("text-[11px] lowercase font-mono", agentColor[t.agent])}>{t.agent}</p>
            </div>
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", priorityStyle[t.priority])}>
              {t.priority}
            </span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{t.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
