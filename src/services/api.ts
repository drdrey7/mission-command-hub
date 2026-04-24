/**
 * Openclaw Mission Control — API client
 * Swap mock data for real backend by setting VITE_OPENCLAW_API_URL.
 *
 * Backend endpoints expected:
 *   GET    /agents
 *   GET    /tasks
 *   GET    /missions
 *   POST   /missions
 *   POST   /missions/:id/abort
 *   GET    /vps/snapshot
 *   GET    /audit?limit=50
 *   GET    /notifications
 *   POST   /chat/:agent                   { messages }
 *   GET    /vps/snapshot                                            → VpsSnapshotResponse
 *   GET    /fail2ban/stats                                          → Fail2banStats
 *   GET    /fail2ban/jails                                          → Fail2banJailsResponse
 *   GET    /fail2ban/banned                                         → Fail2banBannedResponse
 */

import {
  agents as mockAgents,
  tasks as mockTasks,
  missions as mockMissions,
  recentActivity as mockActivity,
  Agent,
  Task,
  Mission,
  ActivityEvent,
  AgentKey,
} from "@/data/mockData";

const API_URL = import.meta.env.VITE_OPENCLAW_API_URL ?? "";
const TOKEN = (import.meta.env.VITE_OPENCLAW_TOKEN as string | undefined) ?? "";
export const USE_MOCK = false;

export type TaskSectionKey = "standby" | "inProgress" | "completed";

export interface TaskItem {
  id: string;
  text: string;
  checked: boolean;
  section: TaskSectionKey;
  owner: string | null;
  taskId?: string | null;
  agentId?: string | null;
  sessionKey?: string | null;
  sessionId?: string | null;
  runId?: string | null;
  dispatchStatus?: string | null;
  conclusion?: string | null;
  currentSection?: string | null;
  currentStatus?: string | null;
  currentText?: string | null;
}

export interface TaskExecutionTokenStats {
  input?: number | null;
  output?: number | null;
  total?: number | null;
  totalFresh?: number | null;
  cacheRead?: number | null;
  cacheWrite?: number | null;
}

export interface TaskExecutionRun {
  id: string;
  recordedAt?: string;
  runId?: string | null;
  sessionKey?: string | null;
  sessionId?: string | null;
  agentId?: string | null;
  status?: string | null;
  section?: string | null;
  instruction?: string | null;
  prompt?: string | null;
  conclusion?: string | null;
  summary?: Array<Record<string, unknown>>;
  sessionFile?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  updatedAt?: string | null;
  runtimeMs?: number | null;
  tokens?: TaskExecutionTokenStats | null;
  provider?: string | null;
  model?: string | null;
  source?: string | null;
}

export interface TaskExecutionEvent {
  id: string;
  at?: string;
  type: string;
  fromSection?: string | null;
  toSection?: string | null;
  text?: string | null;
  prompt?: string | null;
  agentId?: string | null;
  sessionKey?: string | null;
  runId?: string | null;
  status?: string | null;
  error?: string | null;
  note?: string | null;
}

export interface TaskExecutionSession {
  sessionKey?: string | null;
  sessionId?: string | null;
  status?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  updatedAt?: string | null;
  runtimeMs?: number | null;
  tokens?: TaskExecutionTokenStats;
  sessionFile?: string | null;
  summary?: Array<Record<string, unknown>>;
  finalResult?: string | null;
}

export interface TaskExecutionRecord {
  taskId?: string;
  title?: string;
  currentText?: string | null;
  currentSection?: string | null;
  currentStatus?: string | null;
  currentAgentId?: string | null;
  currentSessionKey?: string | null;
  currentRunId?: string | null;
  currentSessionId?: string | null;
  currentConclusion?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
  history?: TaskExecutionRun[];
  events?: TaskExecutionEvent[];
}

export interface TaskDetailTask extends TaskItem {
  boardSection?: TaskSectionKey | null;
  currentSection?: string | null;
  currentStatus?: string | null;
  currentText?: string | null;
}

export interface TaskDetailResponse {
  ok: boolean;
  storePath?: string;
  task: TaskDetailTask;
  record?: TaskExecutionRecord | null;
  history: TaskExecutionRun[];
  events: TaskExecutionEvent[];
  currentRun?: TaskExecutionRun | null;
  session?: TaskExecutionSession | null;
  boardSections?: Record<TaskSectionKey, TaskItem[]> | null;
}

export interface TaskDetailPayload {
  task: TaskDetailTask;
  record?: TaskExecutionRecord | null;
  history: TaskExecutionRun[];
  events: TaskExecutionEvent[];
  currentRun?: TaskExecutionRun | null;
  session?: TaskExecutionSession | null;
  boardSections?: Record<TaskSectionKey, TaskItem[]> | null;
}

export interface TaskReopenInput {
  text?: string;
  instruction?: string;
  section?: TaskSectionKey;
}

export interface TaskFollowUpInput {
  instruction: string;
  prompt: string;
  agentId: string;
  section?: TaskSectionKey;
}

export interface TaskActionResponse {
  ok: boolean;
  task: TaskDetailTask;
  execution: TaskDetailPayload;
  dispatch?: unknown;
}

export interface TasksSummary {
  standby: number;
  inProgress: number;
  completed: number;
  total: number;
}

export interface TasksResponse {
  summary: TasksSummary;
  sections: Record<TaskSectionKey, TaskItem[]>;
  raw?: string;
}

export interface OpenClawStateAgent {
  key: string;
  id?: string;
  name: string;
  role?: string | null;
  status: string;
  executionStatus?: string | null;
  sessions?: number;
  sessionCount?: number;
  lastActivity?: string | null;
  lastActivityAt?: string | null;
  currentTask?: string | null;
  currentTaskId?: string | null;
  currentSessionKey?: string | null;
  currentSessionId?: string | null;
  currentRunId?: string | null;
  source?: string | null;
}

export interface OpenClawStateActivity {
  id: string;
  type?: string;
  text: string;
  source: string;
  timestamp?: string | null;
  severity?: string | null;
  sessionKey?: string | null;
  sessionId?: string | null;
  runId?: string | null;
}

export interface OpenClawState {
  ok: boolean;
  generatedAt?: string;
  agents: OpenClawStateAgent[];
  sessions: Array<Record<string, unknown>>;
  activity: OpenClawStateActivity[];
  errors?: string[];
  warnings?: string[];
  sources?: Record<string, unknown>;
}

export interface TaskMutationInput {
  section: TaskSectionKey;
  text: string;
  taskId?: string | null;
}

export interface TaskEditInput extends TaskMutationInput {
  newText: string;
}

export interface GenerateTaskPromptInput {
  idea: string;
  agentId?: string;
  section: TaskSectionKey;
  model?: string;
}

export interface GenerateTaskPromptResponse {
  ok: boolean;
  prompt: string;
  transport?: string | null;
  provider?: string | null;
  model?: string | null;
}

export interface DispatchTaskInput {
  idea: string;
  prompt: string;
  agentId: string;
  section: TaskSectionKey;
  taskId?: string | null;
}

export interface DispatchTaskResponse {
  ok: boolean;
  task: TaskItem;
  dispatch: unknown;
}

export const TASK_SECTIONS: { key: TaskSectionKey; label: string; apiLabel: string }[] = [
  { key: "standby", label: "Standby", apiLabel: "Standby" },
  { key: "inProgress", label: "In Progress", apiLabel: "In Progress" },
  { key: "completed", label: "Completed", apiLabel: "Completed" },
];

export const taskSectionLabel = (section: TaskSectionKey) =>
  TASK_SECTIONS.find((entry) => entry.key === section)?.label ?? section;

export const taskSectionApiLabel = (section: TaskSectionKey) =>
  TASK_SECTIONS.find((entry) => entry.key === section)?.apiLabel ?? taskSectionLabel(section);

const mockTaskSections: Record<TaskSectionKey, TaskItem[]> = {
  standby: mockTasks.map((task, index) => ({
    id: `mock-standby-${index + 1}`,
    text: task.title,
    checked: false,
    section: "standby",
    owner: task.agent ?? null,
  })),
  inProgress: [],
  completed: [],
};

const mockTaskSummary: TasksSummary = {
  standby: mockTaskSections.standby.length,
  inProgress: 0,
  completed: 0,
  total: mockTaskSections.standby.length,
};

const mockTaskResponse: TasksResponse = {
  summary: mockTaskSummary,
  sections: mockTaskSections,
};

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = TOKEN || localStorage.getItem("openclaw_token") || "";
  const url = `${API_URL}${path}`;
  console.log(`[API] GET ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  console.log(`[API] ${path} response:`, data);
  return data as T;
}

const delay = <T,>(v: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(v), ms));

/* Agents */
export const getAgents = async (): Promise<Agent[]> => {
  if (USE_MOCK) return delay(mockAgents);
  const d = await http<OpenClawState>("/api/state");
  console.log("[getAgents] raw data:", d);
  if ((!d.agents || d.agents.length === 0) && d.errors?.length) {
    throw new Error(d.errors.join(" · "));
  }
  return (d.agents || []).map((a: OpenClawStateAgent) => ({
    key: a.key as AgentKey,
    name: a.name,
    role: a.role || "Agent",
    status: a.status as Agent["status"],
    sessions: a.sessionCount ?? a.sessions ?? 0,
    lastActivity: a.lastActivity ?? a.lastActivityAt ?? "—",
    flightStartedAt: undefined,
    currentTask: a.currentTask ?? undefined,
  }));
};

/* Tasks */
export const getTasks = (): Promise<TasksResponse> => {
  if (USE_MOCK) return delay(mockTaskResponse);
  return http<TasksResponse>("/api/tasks");
};

export const generateTaskPrompt = (input: GenerateTaskPromptInput) =>
  http<GenerateTaskPromptResponse>("/api/tasks/generate-prompt", {
    method: "POST",
    body: JSON.stringify({
      idea: input.idea,
      agentId: input.agentId,
      section: taskSectionApiLabel(input.section),
      model: input.model,
    }),
  });

export const dispatchTask = (input: DispatchTaskInput) =>
  http<DispatchTaskResponse>("/api/tasks/dispatch", {
    method: "POST",
    body: JSON.stringify({
      idea: input.idea,
      prompt: input.prompt,
      agentId: input.agentId,
      section: taskSectionApiLabel(input.section),
      taskId: input.taskId,
    }),
  });

export const createTask = (input: TaskMutationInput) =>
  http<{ success: boolean }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      section: taskSectionApiLabel(input.section),
      text: input.text,
      taskId: input.taskId,
    }),
  });

export const deleteTask = (input: TaskMutationInput) =>
  http<{ success: boolean }>("/api/tasks", {
    method: "DELETE",
    body: JSON.stringify({
      section: taskSectionApiLabel(input.section),
      text: input.text,
      taskId: input.taskId,
    }),
  });

export const moveTask = (input: TaskMutationInput, newSection: TaskSectionKey) =>
  http<{ success: boolean }>("/api/tasks", {
    method: "PATCH",
    body: JSON.stringify({
      section: taskSectionApiLabel(input.section),
      text: input.text,
      taskId: input.taskId,
      newSection: taskSectionApiLabel(newSection),
    }),
  });

export const editTask = (input: TaskEditInput) =>
  http<{ success: boolean }>("/api/tasks", {
    method: "PATCH",
    body: JSON.stringify({
      section: taskSectionApiLabel(input.section),
      text: input.text,
      taskId: input.taskId,
      newText: input.newText,
    }),
  });

export const getTaskDetails = (taskId: string) =>
  http<TaskDetailResponse>(`/api/tasks/${taskId}/details`);

export const reopenTask = (taskId: string, input?: TaskReopenInput) =>
  http<TaskActionResponse>("/api/tasks/" + taskId + "/reopen", {
    method: "POST",
    body: JSON.stringify({
      text: input?.text,
      instruction: input?.instruction,
      section: input?.section ? input.section : undefined,
    }),
  });

export const followUpTask = (taskId: string, input: TaskFollowUpInput) =>
  http<TaskActionResponse>("/api/tasks/" + taskId + "/follow-up", {
    method: "POST",
    body: JSON.stringify({
      instruction: input.instruction,
      prompt: input.prompt,
      agentId: input.agentId,
      section: input.section ? taskSectionApiLabel(input.section) : undefined,
    }),
  });

/* Missions */
export interface NewMissionInput {
  codename: string; objective: string; lead: AgentKey; squad: AgentKey[];
  priority: "alta" | "média" | "baixa"; eta: string;
}
export const getMissions = (): Promise<Mission[]> => USE_MOCK ? delay(mockMissions) : http("/api/missions");
export const createMission = async (input: NewMissionInput): Promise<Mission> => {
  if (USE_MOCK) {
    return delay({
      id: `MX-${String(Math.floor(Math.random() * 900) + 100)}`,
      codename: input.codename, objective: input.objective,
      lead: input.lead, squad: input.squad,
      status: "preparando" as const, progress: 0, eta: input.eta,
    });
  }
  return http("/api/missions", { method: "POST", body: JSON.stringify(input) });
};
export const abortMission = (id: string) =>
  USE_MOCK ? delay({ ok: true }) : http(`/api/missions/${id}/abort`, { method: "POST" });

/* VPS */
export interface VpsContainerSnapshot {
  name: string;
  status: string;
  healthy: boolean;
}

export interface VpsHostSnapshot {
  hostname: string;
  uptime: string | null;
  cpuPercent: number | null;
  ramUsed: string | null;
  ramTotal: string | null;
  ramPercent: number | null;
  diskUsedPercent: number | null;
}

export interface VpsDockerSnapshot {
  total: number | null;
  healthy: number | null;
  unhealthy: number | null;
}

export interface VpsSnapshotResponse {
  ok: boolean;
  collectedAt: string;
  source: string;
  warnings: string[];
  errors: string[];
  host: VpsHostSnapshot;
  containers: VpsContainerSnapshot[];
  docker: VpsDockerSnapshot;
}

const emptyVpsSnapshot: VpsSnapshotResponse = {
  ok: false,
  collectedAt: new Date().toISOString(),
  source: "system",
  warnings: [],
  errors: [],
  host: {
    hostname: "—",
    uptime: null,
    cpuPercent: null,
    ramUsed: null,
    ramTotal: null,
    ramPercent: null,
    diskUsedPercent: null,
  },
  containers: [],
  docker: { total: null, healthy: null, unhealthy: null },
};

function normalizeVpsSnapshotResponse(data: unknown): VpsSnapshotResponse {
  const raw = (data && typeof data === "object") ? data as Partial<VpsSnapshotResponse> : {};
  const hostRaw = raw.host && typeof raw.host === "object" ? raw.host as Partial<VpsHostSnapshot> : {};
  return {
    ...emptyVpsSnapshot,
    ...raw,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((item): item is string => typeof item === "string") : [],
    errors: Array.isArray(raw.errors) ? raw.errors.filter((item): item is string => typeof item === "string") : [],
    host: {
      hostname: typeof hostRaw.hostname === "string" && hostRaw.hostname.trim() ? hostRaw.hostname : "—",
      uptime: typeof hostRaw.uptime === "string" ? hostRaw.uptime : null,
      cpuPercent: typeof hostRaw.cpuPercent === "number" && Number.isFinite(hostRaw.cpuPercent) ? hostRaw.cpuPercent : null,
      ramUsed: typeof hostRaw.ramUsed === "string" ? hostRaw.ramUsed : null,
      ramTotal: typeof hostRaw.ramTotal === "string" ? hostRaw.ramTotal : null,
      ramPercent: typeof hostRaw.ramPercent === "number" && Number.isFinite(hostRaw.ramPercent) ? hostRaw.ramPercent : null,
      diskUsedPercent: typeof hostRaw.diskUsedPercent === "number" && Number.isFinite(hostRaw.diskUsedPercent) ? hostRaw.diskUsedPercent : null,
    },
    containers: Array.isArray(raw.containers)
      ? raw.containers.filter((container): container is VpsContainerSnapshot => Boolean(container && typeof container === "object"))
      : [],
    docker: {
      total: typeof raw.docker?.total === "number" && Number.isFinite(raw.docker.total) ? raw.docker.total : null,
      healthy: typeof raw.docker?.healthy === "number" && Number.isFinite(raw.docker.healthy) ? raw.docker.healthy : null,
      unhealthy: typeof raw.docker?.unhealthy === "number" && Number.isFinite(raw.docker.unhealthy) ? raw.docker.unhealthy : null,
    },
  };
}

export const getVpsSnapshot = (): Promise<VpsSnapshotResponse> => {
  if (USE_MOCK) {
    return delay(normalizeVpsSnapshotResponse({
      ok: true,
      collectedAt: new Date().toISOString(),
      source: "system",
      warnings: [],
      errors: [],
      host: {
        hostname: "mock-host",
        uptime: "0 minutes",
        cpuPercent: 0,
        ramUsed: "0Gi",
        ramTotal: "0Gi",
        ramPercent: 0,
        diskUsedPercent: 0,
      },
      containers: [],
      docker: { total: 0, healthy: 0, unhealthy: 0 },
    }));
  }
  return http<unknown>("/api/vps/snapshot").then(normalizeVpsSnapshotResponse);
};
export type VpsAction = "restart" | "snapshot" | "scale";
export const vpsAction = (id: string, action: VpsAction) =>
  USE_MOCK ? delay({ ok: true, id, action }, 500)
           : http(`/api/vps/nodes/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });

/* Audit */
export const getAuditTrail = (limit = 50): Promise<ActivityEvent[]> => {
  if (USE_MOCK) return delay(mockActivity);
  return http<OpenClawState>(`/api/state?activityLimit=${limit}&sessionLimit=20`).then(data => {
    console.log("[getAuditTrail] raw data:", data);
    const items = Array.isArray(data.activity) ? data.activity : [];
    if (items.length === 0 && data.errors?.length) {
      throw new Error(data.errors.join(" · "));
    }
    return items.map((e) => ({
      id: `audit-${Date.now()}-${Math.random()}`,
      type: e.type || "log",
      text: e.text || "",
      source: e.source || "sistema",
      time: e.timestamp || new Date().toISOString(),
    }));
  });
};

/* Notifications */
export interface Notification {
  id: string; title: string; body: string;
  level: "info" | "warning" | "critical";
  agent?: AgentKey | "sistema"; time: string; read?: boolean;
}
const mockNotifications: Notification[] = [
  { id: "n1", title: "Skyhawk em voo", body: "Mission MX-001 progrediu para 64%.", level: "info", agent: "comandante", time: "agora" },
  { id: "n2", title: "Pico de CPU", body: "openclaw-ai-04 atingiu 88% por 5 min.", level: "warning", agent: "cyber", time: "há 4 min" },
  { id: "n3", title: "Fail2ban: 3 IPs banidos", body: "Tentativa de brute-force em sshd.", level: "warning", agent: "cyber", time: "há 8 min" },
  { id: "n4", title: "Backup OK", body: "Snapshot diário concluído.", level: "info", agent: "sistema", time: "03:00" },
];
export const getNotifications = (): Promise<Notification[]> =>
  USE_MOCK ? delay(mockNotifications) : http("/api/notifications");

/* Chat */
export interface ChatMessage { role: "user" | "assistant"; content: string; }
const cannedReplies: Record<AgentKey, string[]> = {
  agentmail: ["Email processado e registrado.", "Solicitação concluída com sucesso."],
  comandante: ["Confirmado. Estou a coordenar com o esquadrão e devolvo briefing em minutos.", "Aprovação registada. Vou priorizar isto na próxima janela operacional."],
  cyber: ["A executar varredura. Detectei 0 anomalias críticas — relatório em 2 min.", "Política reforçada. MFA aplicado a todos os endpoints."],
  flow: ["Workflow agendado. Próxima execução em 14:00.", "Integração validada. Stripe → Notion → ERP funcionando."],
  ledger: ["Reconciliação iniciada. 142 lançamentos pendentes, ETA 18 min.", "Fechamento OK. Sem discrepâncias."],
};
export const sendChat = async (agent: AgentKey, messages: ChatMessage[]) => {
  if (USE_MOCK) {
    const pool = cannedReplies[agent];
    return delay({ reply: pool[Math.floor(Math.random() * pool.length)] }, 700);
  }
  return http<{ reply: string }>(`/api/chat/${agent}`, { method: "POST", body: JSON.stringify({ messages }) });
};

/* ----------------- Fail2ban ----------------- */
export interface Fail2banJail {
  name: string;
  enabled: boolean;
  currentlyFailed: number | null;
  totalFailed: number | null;
  currentlyBanned: number | null;
  totalBanned: number | null;
  bannedList: string[];
}
export interface BannedIp {
  ip: string;
  jail: string;
}
export interface Fail2banStats {
  ok: boolean;
  collectedAt: string;
  source: string;
  warnings: string[];
  errors: string[];
  totalBanned: number | null;
  bannedCount: number | null;
  jailsActive: number | null;
}

export interface Fail2banJailsResponse {
  ok: boolean;
  collectedAt: string;
  source: string;
  warnings: string[];
  errors: string[];
  jailsActive: number | null;
  jails: Fail2banJail[];
}

export interface Fail2banBannedResponse {
  ok: boolean;
  collectedAt: string;
  source: string;
  warnings: string[];
  errors: string[];
  totalBanned: number | null;
  bannedCount: number | null;
  bannedList: BannedIp[];
}

const mockJails: Fail2banJail[] = [
  { name: "sshd", enabled: true, currentlyFailed: 0, totalFailed: 0, currentlyBanned: 0, totalBanned: 0, bannedList: [] },
];

const mockBanned: BannedIp[] = [
  { ip: "185.220.101.42", jail: "sshd" },
];

const mockStats: Fail2banStats = {
  ok: true,
  collectedAt: new Date().toISOString(),
  source: "fail2ban",
  warnings: [],
  errors: [],
  totalBanned: 0,
  bannedCount: 0,
  jailsActive: 0,
};

export const getFail2banJails = (): Promise<Fail2banJailsResponse> =>
  USE_MOCK
    ? delay({
        ok: true,
        collectedAt: new Date().toISOString(),
        source: "fail2ban",
        warnings: [],
        errors: [],
        jailsActive: mockJails.length,
        jails: mockJails,
      })
    : http<Fail2banJailsResponse>("/api/fail2ban/jails");

export const getFail2banBanned = (): Promise<Fail2banBannedResponse> =>
  USE_MOCK
    ? delay({
        ok: true,
        collectedAt: new Date().toISOString(),
        source: "fail2ban",
        warnings: [],
        errors: [],
        totalBanned: mockBanned.length,
        bannedCount: mockBanned.length,
        bannedList: mockBanned,
      })
    : http<Fail2banBannedResponse>("/api/fail2ban/banned");

export const getFail2banStats = (): Promise<Fail2banStats> =>
  USE_MOCK ? delay(mockStats) : http<Fail2banStats>("/api/fail2ban/stats");

export const unbanIp = (ip: string, jail: string) =>
  USE_MOCK ? delay({ ok: true, ip, jail }, 400)
           : http("/api/fail2ban/unban", { method: "POST", body: JSON.stringify({ ip, jail }) });

/* Memory */
export interface MemoryIndexDay {
  day: string;
  agents: string[];
  exists: boolean;
}

export interface MemoryIndexResponse {
  ok: boolean;
  latestDay: string | null;
  source: string;
  indexExists: boolean;
  days: MemoryIndexDay[];
  agents: string[];
}

export interface MemoryEntry {
  day: string;
  agent: string;
  content: string;
  exists: boolean;
  mtime: string | null;
}

export interface MemoryDayResponse {
  ok: boolean;
  day: string | null;
  agents: string[];
  entries: MemoryEntry[];
  exists: boolean;
  mtime: string | null;
}

export const getMemoryIndex = (): Promise<MemoryIndexResponse> =>
  http<MemoryIndexResponse>("/api/memory/index");

export const getLatestMemory = (): Promise<MemoryDayResponse> =>
  http<MemoryDayResponse>("/api/memory/latest");

export const getMemoryDay = (day: string): Promise<MemoryDayResponse> =>
  http<MemoryDayResponse>(`/api/memory/day/${encodeURIComponent(day)}`);

export const getMemoryAgent = (day: string, agent: string): Promise<MemoryEntry> =>
  http<MemoryEntry>(`/api/memory/day/${encodeURIComponent(day)}/${encodeURIComponent(agent)}`);
