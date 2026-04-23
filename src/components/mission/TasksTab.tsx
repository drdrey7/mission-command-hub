import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Pencil, Plus, Trash2, WandSparkles } from "lucide-react";
import {
  TASK_SECTIONS,
  editTask,
  dispatchTask,
  deleteTask,
  generateTaskPrompt,
  getAgents,
  getTasks,
  moveTask,
  type Agent,
  type TaskItem,
  type TaskSectionKey,
  type TasksResponse,
} from "@/services/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  agentmail: "text-agent-flow",
};

const taskStatusLabel: Record<string, string> = {
  queued: "Em fila",
  dispatched: "Disparada",
  failed: "Falhou",
};

const taskStatusTone: Record<string, string> = {
  queued: "border-status-warning/30 text-status-warning",
  dispatched: "border-status-online/30 text-status-online",
  failed: "border-status-offline/30 text-status-offline",
};

const getTaskKey = (task: TaskItem) => task.taskId ?? task.id;

const mutationPayload = (task: TaskItem) =>
  task.taskId
    ? { section: task.section, text: task.text, taskId: task.taskId }
    : { section: task.section, text: task.text };

export const TasksTab = () => {
  const [board, setBoard] = useState<TasksResponse | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedSection, setSelectedSection] = useState<TaskSectionKey>("standby");
  const [idea, setIdea] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [taskActions, setTaskActions] = useState<Record<string, "delete" | "move" | "edit">>({});
  const [editingTaskKey, setEditingTaskKey] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshTasks = async () => {
    const next = await getTasks();
    setBoard(next);
    setLoading(false);
  };

  const refreshAgents = async () => {
    const next = await getAgents();
    setAgents(next);
    setSelectedAgent((current) => current || next[0]?.key || "");
    setLoadingAgents(false);
  };

  useEffect(() => {
    Promise.all([refreshTasks(), refreshAgents()]).catch((err) => {
      setError(err instanceof Error ? err.message : "Falha ao carregar tarefas");
      setLoading(false);
      setLoadingAgents(false);
    });
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshTasks().catch(() => {
        // The next interval will retry; avoid replacing the current board on transient failures.
      });
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const handleGeneratePrompt = async () => {
    const trimmedIdea = idea.trim();
    if (!trimmedIdea || generating) return;

    setGenerating(true);
    setError(null);
    setStatus(null);
    try {
      const result = await generateTaskPrompt({
        idea: trimmedIdea,
        agentId: selectedAgent || undefined,
        section: selectedSection,
      });
      setPrompt(result.prompt);
      setStatus(`Prompt gerado${result.transport ? ` via ${result.transport}` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar prompt");
    } finally {
      setGenerating(false);
    }
  };

  const handleDispatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedIdea = idea.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedIdea || !trimmedPrompt || !selectedAgent || dispatching) return;

    setDispatching(true);
    setError(null);
    setStatus(null);
    try {
      const result = await dispatchTask({
        idea: trimmedIdea,
        prompt: trimmedPrompt,
        agentId: selectedAgent,
        section: selectedSection,
      });

      setStatus(
        [
          `Task ${result.task.taskId ?? result.task.id}`,
          result.task.sessionKey ? `session ${result.task.sessionKey}` : null,
          result.task.runId ? `run ${result.task.runId}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      setIdea("");
      setPrompt("");
      await refreshTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao dispatch");
    } finally {
      setDispatching(false);
    }
  };

  const handleDelete = async (task: TaskItem) => {
    const taskKey = getTaskKey(task);
    if (taskActions[taskKey] || editingTaskKey === taskKey) return;
    setTaskActions((current) => ({ ...current, [taskKey]: "delete" }));
    setError(null);
    try {
      await deleteTask(mutationPayload(task));
      await refreshTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao eliminar tarefa");
    } finally {
      setTaskActions((current) => {
        const next = { ...current };
        delete next[taskKey];
        return next;
      });
    }
  };

  const handleMove = async (task: TaskItem, nextSection: TaskSectionKey) => {
    const taskKey = getTaskKey(task);
    if (taskActions[taskKey] || nextSection === task.section || editingTaskKey === taskKey) return;
    setTaskActions((current) => ({ ...current, [taskKey]: "move" }));
    setError(null);
    try {
      await moveTask(mutationPayload(task), nextSection);
      await refreshTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao mover tarefa");
    } finally {
      setTaskActions((current) => {
        const next = { ...current };
        delete next[taskKey];
        return next;
      });
    }
  };

  const startEditingTask = (task: TaskItem) => {
    const taskKey = getTaskKey(task);
    setEditingTaskKey(taskKey);
    setEditDrafts((current) => ({
      ...current,
      [taskKey]: task.text,
    }));
  };

  const cancelEditingTask = (taskKey: string) => {
    setEditingTaskKey((current) => (current === taskKey ? null : current));
    setEditDrafts((current) => {
      const next = { ...current };
      delete next[taskKey];
      return next;
    });
  };

  const handleSaveEdit = async (task: TaskItem) => {
    const taskKey = getTaskKey(task);
    const nextText = (editDrafts[taskKey] || "").trim();
    if (!nextText || taskActions[taskKey]) return;

    setTaskActions((current) => ({ ...current, [taskKey]: "edit" }));
    setError(null);
    try {
      await editTask({
        section: task.section,
        text: task.text,
        taskId: task.taskId ?? task.id,
        newText: nextText,
      });
      cancelEditingTask(taskKey);
      await refreshTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao editar tarefa");
    } finally {
      setTaskActions((current) => {
        const next = { ...current };
        delete next[taskKey];
        return next;
      });
    }
  };

  const total = board?.summary.total ?? 0;
  const open = (board?.summary.standby ?? 0) + (board?.summary.inProgress ?? 0);
  const completed = board?.summary.completed ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-surface-1/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Tarefas reais
              </p>
              <h3 className="mt-1 font-display text-lg font-semibold text-foreground">
                Criar e dispatch
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {loading ? "a carregar…" : `${total} totais · ${open} em aberto · ${completed} concluídas`}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Total", value: total },
              { label: "Em aberto", value: open },
              { label: "Concluídas", value: completed },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                  {String(item.value).padStart(2, "0")}
                </p>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleDispatch} className="mt-4 space-y-3">
          <div className="space-y-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Ideia
            </label>
            <Textarea
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder="Escreve a ideia da tarefa em linguagem natural..."
              rows={4}
              className="min-h-[110px] resize-none"
              disabled={dispatching || generating}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Agente
              </label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent} disabled={loadingAgents}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={loadingAgents ? "A carregar..." : "Selecionar agente"} />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.key} value={agent.key}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Secção
              </label>
              <Select value={selectedSection} onValueChange={(value) => setSelectedSection(value as TaskSectionKey)}>
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
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={handleGeneratePrompt}
              disabled={!idea.trim() || generating || dispatching || !selectedAgent}
              className="w-full sm:w-auto"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
              Gerar prompt
            </Button>
            <Button type="submit" disabled={!idea.trim() || !prompt.trim() || !selectedAgent || dispatching} className="w-full sm:w-auto">
              {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar e dispatch
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Prompt editável
              </label>
              <span className="text-[11px] text-muted-foreground">
                {prompt.trim() ? `${prompt.trim().split(/\s+/).length} palavras` : "vazio"}
              </span>
            </div>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Gera primeiro ou escreve/ajusta o prompt manualmente..."
              rows={8}
              className="min-h-[180px] resize-none"
              disabled={dispatching || generating}
            />
          </div>
        </form>

        {status && (
          <p className="mt-3 rounded-lg border border-status-online/30 bg-status-online/5 px-3 py-2 text-sm text-status-online">
            {status}
          </p>
        )}

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
              className={cn("rounded-2xl border border-border/60 p-4 shadow-sm", sectionBodyTone[section.key])}
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
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {String(items.length).padStart(2, "0")}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/50 px-3 py-5 text-center text-xs text-muted-foreground">
                    Sem tarefas nesta secção
                  </div>
                ) : (
                  items.map((task) => {
                    const taskKey = getTaskKey(task);
                    const taskAction = taskActions[taskKey] ?? null;
                    const isEditing = editingTaskKey === taskKey;
                    const draftText = editDrafts[taskKey] ?? task.text;
                    return (
                      <article key={taskKey} className="rounded-xl border border-border/60 bg-background/70 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <Textarea
                                value={draftText}
                                onChange={(event) =>
                                  setEditDrafts((current) => ({
                                    ...current,
                                    [taskKey]: event.target.value,
                                  }))
                                }
                                rows={3}
                                className="min-h-[92px] resize-none"
                                disabled={taskAction === "edit"}
                              />
                            ) : (
                              <p className="text-sm font-medium text-foreground">{task.text}</p>
                            )}
                            {!isEditing && (
                              <div className="mt-1 flex flex-wrap gap-2">
                                <span
                                  className={cn(
                                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                                    task.checked ? "border-status-online/30 text-status-online" : "border-border text-muted-foreground",
                                  )}
                                >
                                  {task.checked ? "Concluída" : "Aberta"}
                                </span>
                                {task.owner && (
                                  <span
                                    className={cn(
                                      "font-mono text-[10px] lowercase",
                                      ownerTone[task.owner] ?? "text-muted-foreground",
                                    )}
                                  >
                                    {task.owner}
                                  </span>
                                )}
                                {task.dispatchStatus && (
                                  <span
                                    className={cn(
                                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                                      taskStatusTone[task.dispatchStatus] ?? "border-border text-muted-foreground",
                                    )}
                                  >
                                    {taskStatusLabel[task.dispatchStatus] ?? task.dispatchStatus}
                                  </span>
                                )}
                              </div>
                            )}
                            {!isEditing && task.conclusion && task.section === "completed" && (
                              <p className="mt-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-foreground">
                                {task.conclusion}
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            {!isEditing && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => startEditingTask(task)}
                                disabled={Boolean(taskAction)}
                                aria-label={`Editar tarefa ${task.text}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-status-offline"
                              onClick={() => handleDelete(task)}
                              disabled={Boolean(taskAction) || isEditing}
                              aria-label={`Eliminar tarefa ${task.text}`}
                            >
                              {taskAction === "delete" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="mt-3 flex gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-9 flex-1"
                              onClick={() => cancelEditingTask(taskKey)}
                              disabled={taskAction === "edit"}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              className="h-9 flex-1"
                              onClick={() => handleSaveEdit(task)}
                              disabled={!draftText.trim() || taskAction === "edit"}
                            >
                              {taskAction === "edit" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                            </Button>
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            <div className="grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
                              <span className="truncate">ID: {task.taskId || task.id}</span>
                              <span className="truncate">Sessão: {task.sessionKey || "—"}</span>
                            </div>

                            <Select
                              value={task.section}
                              onValueChange={(value) => handleMove(task, value as TaskSectionKey)}
                              disabled={Boolean(taskAction)}
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
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
