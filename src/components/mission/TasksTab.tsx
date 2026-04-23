import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  TASK_SECTIONS,
  createTask,
  deleteTask,
  getTasks,
  moveTask,
  type TaskItem,
  type TaskSectionKey,
  type TasksResponse,
} from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const sectionTone: Record<TaskSectionKey, string> = {
  standby: "border-status-warning/40 text-status-warning",
  inProgress: "border-status-online/40 text-status-online",
  completed: "border-border text-muted-foreground",
};

const sectionBodyTone: Record<TaskSectionKey, string> = {
  standby: "bg-status-warning/5",
  inProgress: "bg-status-online/5",
  completed: "bg-muted/20",
};

const ownerTone: Record<string, string> = {
  comandante: "text-agent-comandante",
  cyber: "text-agent-cyber",
  flow: "text-agent-flow",
  ledger: "text-agent-ledger",
};

export const TasksTab = () => {
  const [board, setBoard] = useState<TasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftText, setDraftText] = useState("");
  const [draftSection, setDraftSection] = useState<TaskSectionKey>("standby");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    const next = await getTasks();
    setBoard(next);
    setLoading(false);
  };

  useEffect(() => {
    refresh().catch((err) => {
      setError(err instanceof Error ? err.message : "Falha ao carregar tarefas");
      setLoading(false);
    });
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draftText.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await createTask({ section: draftSection, text });
      setDraftText("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar tarefa");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (task: TaskItem) => {
    if (busyKey) return;
    setBusyKey(task.id);
    setError(null);
    try {
      await deleteTask({ section: task.section, text: task.text });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao eliminar tarefa");
    } finally {
      setBusyKey(null);
    }
  };

  const handleMove = async (task: TaskItem, nextSection: TaskSectionKey) => {
    if (busyKey || nextSection === task.section) return;
    setBusyKey(task.id);
    setError(null);
    try {
      await moveTask({ section: task.section, text: task.text }, nextSection);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao mover tarefa");
    } finally {
      setBusyKey(null);
    }
  };

  const openCount = (board?.summary.standby ?? 0) + (board?.summary.inProgress ?? 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-surface-1/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Resumo real
            </p>
            <h3 className="mt-1 font-display text-lg font-semibold text-foreground">
              Tarefas atuais
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {loading ? "a carregar…" : `${board?.summary.total ?? 0} tarefas · ${openCount} em aberto`}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Total", value: board?.summary.total ?? 0 },
            { label: "Standby", value: board?.summary.standby ?? 0 },
            { label: "Em curso", value: board?.summary.inProgress ?? 0 },
            { label: "Concluídas", value: board?.summary.completed ?? 0 },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">{String(item.value).padStart(2, "0")}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleCreate} className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <Input
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            placeholder="Nova tarefa real…"
            disabled={submitting}
          />
          <Select value={draftSection} onValueChange={(value) => setDraftSection(value as TaskSectionKey)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Secção" />
            </SelectTrigger>
            <SelectContent>
              {TASK_SECTIONS.map((section) => (
                <SelectItem key={section.key} value={section.key}>
                  {section.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={submitting || !draftText.trim()} className="w-full sm:w-auto">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar
          </Button>
        </form>

        {error && (
          <p className="mt-3 rounded-lg border border-status-offline/30 bg-status-offline/5 px-3 py-2 text-sm text-status-offline">
            {error}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {TASK_SECTIONS.map((section) => {
          const items = board?.sections[section.key] ?? [];
          return (
            <section
              key={section.key}
              className={cn(
                "rounded-2xl border border-border/60 p-4 shadow-sm",
                sectionBodyTone[section.key],
              )}
            >
              <div className={cn("flex items-center justify-between border-b pb-2", sectionTone[section.key])}>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">{section.label}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {section.key === "standby"
                      ? "Pendentes"
                      : section.key === "inProgress"
                        ? "A decorrer"
                        : "Concluídas"}
                  </p>
                </div>
                <span className="font-mono text-xs tabular-nums text-foreground">{String(items.length).padStart(2, "0")}</span>
              </div>

              <div className="mt-3 space-y-2">
                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/50 px-3 py-5 text-center text-xs text-muted-foreground">
                    Sem tarefas nesta secção
                  </div>
                ) : (
                  items.map((task) => (
                    <article key={task.id} className="rounded-xl border border-border/60 bg-background/70 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{task.text}</p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <span className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                              task.checked ? "border-status-online/30 text-status-online" : "border-border text-muted-foreground",
                            )}>
                              {task.checked ? "Concluída" : "Aberta"}
                            </span>
                            {task.owner && (
                              <span className={cn("font-mono text-[10px] lowercase", ownerTone[task.owner] ?? "text-muted-foreground")}>
                                {task.owner}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-status-offline"
                          onClick={() => handleDelete(task)}
                          disabled={busyKey === task.id}
                          aria-label={`Eliminar tarefa ${task.text}`}
                        >
                          {busyKey === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>

                      <div className="mt-3">
                        <Select
                          value={task.section}
                          onValueChange={(value) => handleMove(task, value as TaskSectionKey)}
                          disabled={busyKey === task.id}
                        >
                          <SelectTrigger className="h-9 w-full text-xs">
                            <SelectValue placeholder="Mover para…" />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_SECTIONS.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                Mover para {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
