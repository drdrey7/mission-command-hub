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

export const ActiveTasksPanel = () => {
  return (
    <div className="panel flex h-full flex-col p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-surface-2">
            <ClipboardList className="h-5 w-5 text-agent-comandante" />
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
              Tarefas Ativas
            </h2>
            <p className="text-xs text-muted-foreground">Operações em curso hoje</p>
          </div>
        </div>
        <span className="rounded-md border border-agent-comandante/30 bg-agent-comandante/10 px-2 py-1 font-mono text-xs font-bold text-agent-comandante">
          {tasks.length}
        </span>
      </div>

      <div className="my-5 flex items-baseline gap-3">
        <span className="font-mono text-5xl font-bold text-foreground">{tasks.length}</span>
        <span className="text-sm text-muted-foreground">tarefas em fila operacional</span>
      </div>

      <div className="flex-1 space-y-2">
        {tasks.slice(0, 4).map((t) => (
          <div
            key={t.id}
            className="group flex items-center gap-3 rounded-lg border border-border/40 bg-surface-2/40 p-3 transition-smooth hover:border-border hover:bg-surface-2"
          >
            <div className={cn("h-2 w-2 rounded-full", agentColor[t.agent].replace("text-", "bg-"))} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
              <p className={cn("text-xs lowercase", agentColor[t.agent])}>{t.agent}</p>
            </div>
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                priorityStyle[t.priority]
              )}
            >
              {t.priority}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{t.time}</span>
          </div>
        ))}
      </div>

      <button className="mt-4 flex items-center justify-between rounded-lg border border-border/60 bg-surface-2/60 px-4 py-2.5 text-sm text-muted-foreground transition-smooth hover:border-agent-comandante/40 hover:text-foreground">
        <span>Ver todas as tarefas</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
};
