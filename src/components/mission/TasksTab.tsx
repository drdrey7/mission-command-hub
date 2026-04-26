import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Loader2, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, WandSparkles } from "lucide-react";
import {
  TASK_SECTIONS,
  editTask,
  dispatchTask,
  deleteTask,
  followUpTask,
  generateTaskPrompt,
  getAgents,
  getTaskDetails,
  getTasks,
  moveTask,
  reopenTask,
  type Agent,
  type TaskDetailResponse,
  type TaskItem,
  type TaskSectionKey,
  type TasksResponse,
} from "@/services/api";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

const statusCopy: Record<string, { label: string; tone: string }> = {
  idle: { label: "Inativa", tone: "border-border text-muted-foreground" },
  in_progress: { label: "Em curso", tone: "border-status-online/30 text-status-online" },
  completed: { label: "Concluída", tone: "border-status-online/30 text-status-online" },
  error: { label: "Erro", tone: "border-status-offline/30 text-status-offline" },
  queued: { label: "Em fila", tone: "border-status-warning/30 text-status-warning" },
  dispatched: { label: "Disparada", tone: "border-status-online/30 text-status-online" },
  failed: { label: "Falhou", tone: "border-status-offline/30 text-status-offline" },
};

const getTaskKey = (task: TaskItem) => task.taskId ?? task.id;

const mutationPayload = (task: TaskItem) =>
  task.taskId
    ? { section: task.section, text: task.text, taskId: task.taskId }
    : { section: task.section, text: task.text };

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const getTaskStatus = (task: TaskItem) => task.currentStatus || task.dispatchStatus || (task.section === "completed" ? "completed" : "idle");

const getTaskStatusCopy = (task: TaskItem) => statusCopy[getTaskStatus(task)] ?? statusCopy.idle;

const getTaskAgent = (task: TaskItem) => task.currentAgentId || task.agentId || task.owner || null;

const sectionLabelByKey: Record<TaskSectionKey, string> = {
  standby: "Standby",
  inProgress: "Em curso",
  completed: "Concluídas",
};

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
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailBusy, setDetailBusy] = useState<"save" | "reopen" | "dispatch" | "prompt" | null>(null);
  const [detail, setDetail] = useState<TaskDetailResponse | null>(null);
  const [detailInstruction, setDetailInstruction] = useState("");
  const [detailPrompt, setDetailPrompt] = useState("");
  const [detailAgent, setDetailAgent] = useState("");
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

  const loadTaskDetail = async (taskId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const response = await getTaskDetails(taskId);
      setDetail(response);
      const nextInstruction = response.task.currentText || response.task.text || "";
      setDetailInstruction(nextInstruction);
      setDetailPrompt((response.task.sessionKey || response.task.sessionId) ? (response.currentRun?.prompt || nextInstruction) : nextInstruction);
      setDetailAgent(response.task.agentId || response.currentRun?.agentId || selectedAgent || agents[0]?.key || "");
      setDetailOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir detalhe da tarefa");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshCurrentDetail = async () => {
    if (!detail) return;
    await loadTaskDetail(getTaskKey(detail.task));
  };

  const openTaskDetail = async (task: TaskItem) => {
    await loadTaskDetail(getTaskKey(task));
  };

  const handleGenerateDetailPrompt = async () => {
    const instruction = detailInstruction.trim();
    const agentId = detailAgent.trim() || selectedAgent;
    if (!instruction || !agentId || detailBusy) return;

    setDetailBusy("prompt");
    setError(null);
    try {
      const result = await generateTaskPrompt({
        idea: instruction,
        agentId,
        section: "inProgress",
      });
      setDetailPrompt(result.prompt);
      setStatus(`Prompt do detalhe gerado${result.transport ? ` via ${result.transport}` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar prompt de seguimento");
    } finally {
      setDetailBusy(null);
    }
  };

  const handleSaveDetailText = async () => {
    const task = detail?.task;
    const taskId = task ? getTaskKey(task) : "";
    const nextText = detailInstruction.trim();
    if (!task || !taskId || !nextText || detailBusy) return;

    setDetailBusy("save");
    setError(null);
    try {
      await editTask({
        section: task.section,
        text: task.text,
        taskId,
        newText: nextText,
      });
      setStatus("Texto da tarefa atualizado.");
      await Promise.all([refreshTasks(), refreshCurrentDetail()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao guardar a edição");
    } finally {
      setDetailBusy(null);
    }
  };

  const handleReopenDetail = async () => {
    const task = detail?.task;
    const taskId = task ? getTaskKey(task) : "";
    const nextText = detailInstruction.trim();
    if (!task || !taskId || detailBusy) return;

    setDetailBusy("reopen");
    setError(null);
    try {
      await reopenTask(taskId, {
        text: nextText || undefined,
        section: "inProgress",
      });
      setStatus("Tarefa reaberta para In Progress.");
      await Promise.all([refreshTasks(), refreshCurrentDetail()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reabrir a tarefa");
    } finally {
      setDetailBusy(null);
    }
  };

  const handleFollowUpDetail = async () => {
    const task = detail?.task;
    const taskId = task ? getTaskKey(task) : "";
    const instruction = detailInstruction.trim();
    const promptText = detailPrompt.trim() || instruction;
    const agentId = detailAgent.trim() || selectedAgent;
    if (!task || !taskId || !instruction || !promptText || !agentId || detailBusy) return;

    setDetailBusy("dispatch");
    setError(null);
    try {
      await followUpTask(taskId, {
        instruction,
        prompt: promptText,
        agentId,
        section: "inProgress",
      });
      setStatus("Follow-up enviado e tarefa regressou a In Progress.");
      await Promise.all([refreshTasks(), refreshCurrentDetail()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao despachar o follow-up");
    } finally {
      setDetailBusy(null);
    }
  };

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
          result.task.sessionId ? `session ${result.task.sessionId}` : (result.task.sessionKey ? `session ${result.task.sessionKey}` : null),
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
  const detailTask = detail?.task ?? null;
  const detailFinalResponse = detail?.session?.finalResult || detail?.currentRun?.conclusion || detailTask?.conclusion || "";
  const activeSections = TASK_SECTIONS.filter((section) => section.key !== "completed");
  const completedItems = board?.sections.completed ?? [];

  const renderTaskCard = (task: TaskItem, variant: "active" | "completed" = "active") => {
    const taskKey = getTaskKey(task);
    const taskAction = taskActions[taskKey] ?? null;
    const isEditing = editingTaskKey === taskKey;
    const draftText = editDrafts[taskKey] ?? task.text;
    const statusInfo = getTaskStatusCopy(task);
    const agentName = getTaskAgent(task);
    const sessionRef = task.sessionId || task.sessionKey || null;
    const isCompact = variant === "completed";

    return (
      <article
        key={taskKey}
        className={cn(
          "rounded-xl border border-border/60 bg-background/75 shadow-sm transition-colors hover:border-primary/25",
          isCompact ? "p-3" : "p-3.5",
        )}
      >
        <div className="flex items-start justify-between gap-3">
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
                className="min-h-[86px] resize-none"
                disabled={taskAction === "edit"}
              />
            ) : (
              <div className="space-y-2">
                <p className={cn("font-medium leading-5 text-foreground", isCompact ? "line-clamp-2 text-sm" : "text-sm")}>
                  {task.text}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      statusInfo.tone,
                    )}
                  >
                    {statusInfo.label}
                  </span>
                  {agentName && (
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-mono text-[10px] lowercase tracking-wide",
                        ownerTone[String(agentName)] ?? "border-border text-muted-foreground",
                      )}
                    >
                      {agentName}
                    </span>
                  )}
                  {variant === "active" && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {sectionLabelByKey[task.section]}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => void openTaskDetail(task)}
              aria-label={`Abrir detalhe da tarefa ${task.text}`}
            >
              <ArrowUpRight className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  aria-label={`Mais ações para ${task.text}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => startEditingTask(task)} disabled={Boolean(taskAction) || isEditing}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void handleDelete(task)}
                  disabled={Boolean(taskAction) || isEditing}
                  className="text-status-offline focus:text-status-offline"
                >
                  {taskAction === "delete" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Eliminar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="px-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Mover para
                </DropdownMenuLabel>
                {TASK_SECTIONS.filter((option) => option.key !== task.section).map((option) => (
                  <DropdownMenuItem
                    key={option.key}
                    onClick={() => handleMove(task, option.key)}
                    disabled={Boolean(taskAction)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isEditing ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-9"
              onClick={() => cancelEditingTask(taskKey)}
              disabled={taskAction === "edit"}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="h-9"
              onClick={() => handleSaveEdit(task)}
              disabled={!draftText.trim() || taskAction === "edit"}
            >
              {taskAction === "edit" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
            <span className="max-w-full truncate font-mono">ID {task.taskId || task.id}</span>
            {sessionRef && <span className="max-w-full truncate font-mono">Sessão {sessionRef}</span>}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface-1/70 shadow-sm">
        <div className="border-b border-border/50 bg-background/35 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Task bay
              </p>
              <h3 className="mt-1 font-display text-lg font-semibold text-foreground">
                Criar e dispatch
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Ideia, prompt revisto e envio real para agente.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border/50 bg-background/50 p-1.5 sm:min-w-[260px]">
              {[
                { label: "Total", value: total },
                { label: "Abertas", value: open },
                { label: "Done", value: completed },
              ].map((item) => (
                <div key={item.label} className="rounded-lg px-2 py-1.5 text-center">
                  <p className="font-mono text-base font-bold tabular-nums text-foreground">
                    {loading ? "--" : String(item.value).padStart(2, "0")}
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={handleDispatch} className="space-y-3 px-4 py-4 sm:px-5">
          <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  1 · Ideia
                </label>
                <Textarea
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  placeholder="Escreve a ideia da tarefa em linguagem natural..."
                  rows={3}
                  className="min-h-[88px] resize-none"
                  disabled={dispatching || generating}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
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

              <Button
                type="button"
                variant="secondary"
                onClick={handleGeneratePrompt}
                disabled={!idea.trim() || generating || dispatching || !selectedAgent}
                className="w-full"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                2 · Gerar prompt
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  3 · Prompt editável
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {prompt.trim() ? `${prompt.trim().split(/\s+/).length} palavras` : "vazio"}
                </span>
              </div>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Gera primeiro ou escreve/ajusta o prompt manualmente..."
                rows={6}
                className="min-h-[132px] resize-none lg:min-h-[164px]"
                disabled={dispatching || generating}
              />
              <Button type="submit" disabled={!idea.trim() || !prompt.trim() || !selectedAgent || dispatching} className="w-full">
                {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                4 · Enviar para agente
              </Button>
            </div>
          </div>
        </form>

        {status && (
          <p className="mx-4 mb-4 rounded-lg border border-status-online/30 bg-status-online/5 px-3 py-2 text-sm text-status-online sm:mx-5">
            {status}
          </p>
        )}

        {error && (
          <p className="mx-4 mb-4 rounded-lg border border-status-offline/30 bg-status-offline/5 px-3 py-2 text-sm text-status-offline sm:mx-5">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between px-1">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Active board
            </p>
            <h3 className="mt-1 font-display text-base font-semibold text-foreground">
              Trabalho em voo
            </h3>
          </div>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {String(open).padStart(2, "0")} abertas
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {activeSections.map((section) => {
          const items = board?.sections[section.key] ?? [];
          return (
            <section
              key={section.key}
              className={cn("rounded-2xl border border-border/60 p-3 shadow-sm sm:p-4", sectionBodyTone[section.key])}
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
                  <div className="rounded-xl border border-dashed border-border/50 px-3 py-4 text-center text-xs text-muted-foreground">
                    Sem tarefas nesta secção
                  </div>
                ) : (
                  items.map((task) => renderTaskCard(task))
                )}
              </div>
            </section>
          );
        })}
        </div>

        <Accordion type="single" collapsible className="rounded-2xl border border-border/60 bg-muted/10 px-3 sm:px-4">
          <AccordionItem value="completed" className="border-0">
            <AccordionTrigger className="py-3 text-left hover:no-underline">
              <span className="flex w-full items-center justify-between gap-3 pr-2">
                <span>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Completed archive
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Recolhido para manter foco no trabalho ativo
                  </span>
                </span>
                <span className="rounded-full border border-border/60 px-2 py-1 font-mono text-xs tabular-nums text-foreground">
                  {String(completedItems.length).padStart(2, "0")}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <div className="space-y-2">
                {completedItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/50 px-3 py-4 text-center text-xs text-muted-foreground">
                    Sem tarefas concluídas
                  </div>
                ) : (
                  completedItems.map((task) => renderTaskCard(task, "completed"))
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader className="space-y-2 pr-8">
            <SheetTitle className="text-lg font-semibold">
              {detailTask ? detailTask.text : "Detalhe da tarefa"}
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              {detailLoading
                ? "A carregar detalhe e histórico..."
                : detailTask
                  ? `Task ${getTaskKey(detailTask)} · ${detailTask.currentSection || detailTask.section} · ${detailTask.currentStatus || detailTask.dispatchStatus || "sem estado"}`
                  : "Abre uma tarefa para ver execução, sessão e histórico."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            {detailLoading && (
              <div className="rounded-2xl border border-border/60 bg-surface-1/60 p-4 text-sm text-muted-foreground">
                A carregar detalhe persistido...
              </div>
            )}

            {!detailLoading && detailTask && (
              <>
                <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {detailTask.currentSection || detailTask.section}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        getTaskStatus(detailTask) === "completed"
                          ? "border-status-online/30 text-status-online"
                          : getTaskStatus(detailTask) === "error" || getTaskStatus(detailTask) === "failed"
                            ? "border-status-offline/30 text-status-offline"
                            : "border-status-warning/30 text-status-warning",
                      )}
                    >
                      {getTaskStatusCopy(detailTask).label}
                    </span>
                    {getTaskAgent(detailTask) && (
                      <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {getTaskAgent(detailTask)}
                      </span>
                    )}
                    <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {detail.session?.status || detail.currentRun?.status || "sem sessão"}
                    </span>
                  </div>

                  <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                          Resposta final
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Resultado operacional mais recente desta tarefa
                        </p>
                      </div>
                      <span className="rounded-full border border-primary/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {detailFinalResponse ? "disponível" : "sem resposta"}
                      </span>
                    </div>
                    <div className="mt-3 max-h-[42vh] overflow-y-auto rounded-xl border border-border/50 bg-background/70 px-3 py-3 text-sm leading-6 text-foreground">
                      {detailFinalResponse || "Sem resposta final disponível para esta execução."}
                    </div>
                  </div>

                  <div className="mt-4 border-t border-border/50 pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Edição e follow-up
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Mantém a instrução, ajusta o prompt e envia nova continuação quando necessário.
                    </p>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Instrução atual
                      </label>
                      <Textarea
                        value={detailInstruction}
                        onChange={(event) => setDetailInstruction(event.target.value)}
                        rows={5}
                        className="min-h-[130px] resize-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Prompt de follow-up
                      </label>
                      <Textarea
                        value={detailPrompt}
                        onChange={(event) => setDetailPrompt(event.target.value)}
                        rows={5}
                        className="min-h-[130px] resize-none"
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Agente
                      </label>
                      <Select value={detailAgent} onValueChange={setDetailAgent}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecionar agente" />
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
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-4">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleGenerateDetailPrompt()}
                      disabled={!detailInstruction.trim() || !detailAgent.trim() || detailBusy !== null}
                      className="w-full"
                    >
                      {detailBusy === "prompt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                      Gerar prompt
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleSaveDetailText()}
                      disabled={!detailInstruction.trim() || detailBusy !== null}
                      className="w-full"
                    >
                      {detailBusy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                      Guardar texto
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleReopenDetail()}
                      disabled={!detailInstruction.trim() || detailBusy !== null}
                      className="w-full"
                    >
                      {detailBusy === "reopen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Reabrir
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleFollowUpDetail()}
                      disabled={!detailInstruction.trim() || !detailPrompt.trim() || !detailAgent.trim() || detailBusy !== null}
                      className="w-full"
                    >
                      {detailBusy === "dispatch" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                      Follow-up e dispatch
                    </Button>
                  </div>
                </div>

                <Accordion type="single" collapsible className="rounded-2xl border border-border/60 bg-background/70 px-4">
                  <AccordionItem value="technical" className="border-0">
                    <AccordionTrigger className="py-4 text-left">
                      <span className="flex flex-col gap-1">
                        <span className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Detalhes técnicos
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Sessão, timestamps, histórico e linha temporal
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="space-y-3">
                        <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Sessão associada
                            </h4>
                            <span className="text-[11px] text-muted-foreground">
                              {detail.session?.status || detail.currentRun?.status || "sem status"}
                            </span>
                          </div>
                          {detail.session ? (
                            <div className="mt-3 space-y-2 text-sm">
                              <p className="break-all font-mono text-xs text-foreground">
                                {detail.session.sessionId ? `session id: ${detail.session.sessionId}` : "session id: —"}
                              </p>
                              <p className="break-all font-mono text-xs text-foreground">
                                {detail.session.sessionKey ? `session key: ${detail.session.sessionKey}` : "session key: —"}
                              </p>
                              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                <span>Início: {formatDateTime(detail.session.startedAt)}</span>
                                <span>Fim: {formatDateTime(detail.session.endedAt)}</span>
                                <span>Actualizado: {formatDateTime(detail.session.updatedAt)}</span>
                                <span>Duração: {detail.session.runtimeMs ? `${Math.round(detail.session.runtimeMs / 1000)}s` : "—"}</span>
                              </div>
                              <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                                {detail.session.finalResult || "Sem resultado final disponível"}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-muted-foreground">Sem sessão associada disponível.</p>
                          )}
                        </div>

                        <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Timestamps
                            </h4>
                            <span className="text-[11px] text-muted-foreground">
                              {detail.history.length} execuções
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            <span>Criada: {formatDateTime(detail.record?.createdAt)}</span>
                            <span>Actualizada: {formatDateTime(detail.record?.updatedAt)}</span>
                            <span>Apagada: {formatDateTime(detail.record?.deletedAt)}</span>
                            <span>Secção actual: {detail.task.currentSection || detail.task.section}</span>
                          </div>
                          <div className="mt-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                            Histórico persistido em <span className="break-all font-mono text-foreground">{detail.storePath}</span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Histórico de execuções
                            </h4>
                            <span className="text-[11px] text-muted-foreground">
                              {detail.history.length} registos
                            </span>
                          </div>
                          <div className="mt-3 space-y-3">
                            {detail.history.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                                Ainda não existe histórico guardado para esta tarefa.
                              </div>
                            ) : (
                              detail.history.map((run) => (
                                <article key={run.id} className="rounded-xl border border-border/60 bg-background/70 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="space-y-1">
                                      <p className="text-sm font-semibold text-foreground">
                                        {run.status || "unknown"} · {run.section || "—"}
                                      </p>
                                      <p className="font-mono text-[11px] text-muted-foreground">
                                        {run.runId || run.sessionId || run.id}
                                      </p>
                                    </div>
                                    <div className="text-right text-[11px] text-muted-foreground">
                                      <p>{formatDateTime(run.startedAt)}</p>
                                      <p>{formatDateTime(run.endedAt)}</p>
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                    <span>Session key: {run.sessionKey || "—"}</span>
                                    <span>Session id: {run.sessionId || "—"}</span>
                                    <span>Agente: {run.agentId || "—"}</span>
                                    <span>Origem: {run.source || "—"}</span>
                                  </div>
                                  <div className="mt-3 space-y-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                      Instrução
                                    </p>
                                    <p className="whitespace-pre-wrap text-sm text-foreground">
                                      {run.instruction || "—"}
                                    </p>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                      Resposta
                                    </p>
                                    <p className="whitespace-pre-wrap text-sm text-foreground">
                                      {run.conclusion || "—"}
                                    </p>
                                  </div>
                                </article>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Linha temporal resumida
                          </h4>
                          <div className="mt-3 space-y-2">
                            {(detail.events || []).length === 0 ? (
                              <div className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                                Sem eventos adicionais registados.
                              </div>
                            ) : (
                              detail.events.map((event) => (
                                <div key={event.id} className="rounded-xl border border-border/60 bg-background/60 p-3 text-sm">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-medium text-foreground">{event.type}</p>
                                    <span className="text-[11px] text-muted-foreground">{formatDateTime(event.at)}</span>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {[
                                      event.fromSection ? `de ${event.fromSection}` : null,
                                      event.toSection ? `para ${event.toSection}` : null,
                                      event.agentId ? `agente ${event.agentId}` : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </p>
                                  {event.text && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{event.text}</p>}
                                  {event.error && <p className="mt-2 text-xs text-status-offline">{event.error}</p>}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
