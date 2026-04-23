import { useEffect, useState } from "react";
import { ClipboardList, ChevronRight } from "lucide-react";
import { getTasks, type TasksResponse } from "@/services/api";
import { cn } from "@/lib/utils";

interface Props {
  onSeeAll?: () => void;
}

export const ActiveTasksPanel = ({ onSeeAll }: Props) => {
  const [board, setBoard] = useState<TasksResponse | null>(null);

  useEffect(() => {
    getTasks().then(setBoard);
  }, []);

  const summary = board?.summary;
  const total = summary?.total ?? 0;
  const open = (summary?.standby ?? 0) + (summary?.inProgress ?? 0);
  const completed = summary?.completed ?? 0;
  const completion = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface-2">
            <ClipboardList className="h-4 w-4 text-agent-comandante" />
          </div>
          <div>
            <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
              Resumo de tarefas
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {board === null ? "a carregar…" : `${total} totais · ${open} em aberto`}
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

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: "Total", value: total },
          { label: "Em aberto", value: open },
          { label: "Concluídas", value: completed },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border/60 bg-surface-2/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{item.label}</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">{String(item.value).padStart(2, "0")}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-border/60 bg-surface-1/40 px-3 py-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          <span>Conclusão</span>
          <span>{completion}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn("h-full rounded-full bg-status-online transition-all")}
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>
    </div>
  );
};
