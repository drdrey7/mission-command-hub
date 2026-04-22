import { useEffect, useState } from "react";
import { tasks as fallbackTasks, Task } from "@/data/mockData";
import { getTasks } from "@/services/api";
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

export const TasksTab = () => {
  const [tasks, setTasks] = useState<Task[]>(fallbackTasks);
  useEffect(() => { getTasks().then(setTasks); }, []);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{tasks.length} tarefas em fila</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-surface-2/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Tarefa</th>
              <th className="px-3 py-2 text-left font-medium">Agente</th>
              <th className="px-3 py-2 text-left font-medium">Prioridade</th>
              <th className="px-3 py-2 text-right font-medium">Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {tasks.map((t) => (
              <tr key={t.id} className="transition-smooth hover:bg-surface-2/40">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", agentColor[t.agent].replace("text-", "bg-"))} />
                    <span className="text-foreground">{t.title}</span>
                  </div>
                </td>
                <td className={cn("px-3 py-2.5 text-xs lowercase font-mono", agentColor[t.agent])}>{t.agent}</td>
                <td className="px-3 py-2.5">
                  <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", priorityStyle[t.priority])}>
                    {t.priority}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground tabular-nums">{t.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
