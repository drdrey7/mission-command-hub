import { useEffect, useMemo, useState } from "react";
import { getTasks } from "@/services/api";
import type { Task } from "@/data/mockData";
import { cn } from "@/lib/utils";

const agentColor: Record<NonNullable<Task["agent"]>, string> = {
  comandante: "text-agent-comandante",
  cyber: "text-agent-cyber",
  flow: "text-agent-flow",
  ledger: "text-agent-ledger",
};

const COLUMNS: { key: Task["column"]; label: string; cls: string }[] = [
  { key: "in_progress", label: "Em curso", cls: "border-status-online/40 text-status-online" },
  { key: "standby",     label: "Standby",  cls: "border-status-warning/40 text-status-warning" },
  { key: "blocked",     label: "Bloqueada", cls: "border-status-offline/40 text-status-offline" },
  { key: "done",        label: "Concluída", cls: "border-border text-muted-foreground" },
];

export const TasksTab = () => {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  useEffect(() => { getTasks().then(setTasks); }, []);

  const grouped = useMemo(() => {
    const map: Record<Task["column"], Task[]> = { standby: [], in_progress: [], blocked: [], done: [] };
    (tasks ?? []).forEach((t) => map[t.column].push(t));
    return map;
  }, [tasks]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {tasks === null ? "a carregar…" : `${tasks.length} tarefas`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = grouped[col.key];
          return (
            <div key={col.key} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
              <div className={cn("mb-2 flex items-center justify-between border-b pb-2", col.cls)}>
                <span className="text-[11px] font-bold uppercase tracking-wider">{col.label}</span>
                <span className="font-mono text-xs tabular-nums">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border/40 p-3 text-center text-[11px] text-muted-foreground">
                    Sem tarefas
                  </p>
                ) : (
                  items.map((t) => (
                    <div key={t.id} className="rounded-md border border-border/40 bg-surface-1/60 p-2.5">
                      <p className="text-sm text-foreground">{t.title}</p>
                      {t.agent && (
                        <p className={cn("mt-1 font-mono text-[10px] lowercase", agentColor[t.agent])}>
                          {t.agent}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
