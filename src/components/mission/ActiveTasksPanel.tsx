import { useEffect, useState } from "react";
import { ClipboardList, ChevronRight } from "lucide-react";
import { getTasks } from "@/services/api";
import type { Task } from "@/data/mockData";
import { cn } from "@/lib/utils";

const agentColor: Record<NonNullable<Task["agent"]>, string> = {
  comandante: "text-agent-comandante",
  cyber: "text-agent-cyber",
  flow: "text-agent-flow",
  ledger: "text-agent-ledger",
};

const colLabel: Record<Task["column"], string> = {
  standby: "Standby",
  in_progress: "Em curso",
  blocked: "Bloqueada",
  done: "Concluída",
};

const colStyle: Record<Task["column"], string> = {
  in_progress: "bg-status-online/10 text-status-online border-status-online/30",
  blocked: "bg-status-offline/10 text-status-offline border-status-offline/30",
  standby: "bg-status-warning/10 text-status-warning border-status-warning/30",
  done: "bg-muted/40 text-muted-foreground border-border",
};

interface Props { onSeeAll?: () => void }

export const ActiveTasksPanel = ({ onSeeAll }: Props) => {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  useEffect(() => { getTasks().then(setTasks); }, []);

  const open = (tasks ?? []).filter((t) => t.column !== "done");
  const top = open.slice(0, 4);

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface-2">
            <ClipboardList className="h-4 w-4 text-agent-comandante" />
          </div>
          <div>
            <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
              Tarefas em aberto
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {tasks === null ? "a carregar…" : `${open.length} em aberto · ${tasks.length} totais`}
            </p>
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
        {top.length === 0 && tasks !== null && (
          <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            Sem tarefas
          </p>
        )}
        {top.map((t) => (
          <div key={t.id} className="group flex items-center gap-3 rounded-lg border border-border/40 bg-surface-2/40 p-2.5 transition-smooth hover:border-border hover:bg-surface-2">
            <div className={cn("h-2 w-2 rounded-full", t.agent ? agentColor[t.agent].replace("text-", "bg-") : "bg-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
              {t.agent && <p className={cn("text-[11px] lowercase font-mono", agentColor[t.agent])}>{t.agent}</p>}
            </div>
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", colStyle[t.column])}>
              {colLabel[t.column]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
