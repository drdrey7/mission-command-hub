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
 *   GET    /vps/nodes
 *   POST   /vps/nodes/:id/action          { action }
 *   GET    /audit?limit=50
 *   GET    /notifications
 *   POST   /chat/:agent                   { messages }
 *   GET    /fail2ban/jails                                          → Jail[]
 *   GET    /fail2ban/banned                                         → BannedIp[]
 *   POST   /fail2ban/unban                { ip, jail }              → { ok }
 *   GET    /fail2ban/stats                                          → Fail2banStats
 */

import {
  agents as mockAgents,
  tasks as mockTasks,
  missions as mockMissions,
  vpsNodes as mockNodes,
  recentActivity as mockActivity,
  Agent,
  Task,
  Mission,
  VpsNode,
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
  const d = await http<any>("/api/agents");
  console.log("[getAgents] raw data:", d);
  return d.agents.map((a: any) => ({
    key: a.name as AgentKey,
    name: a.name.charAt(0).toUpperCase() + a.name.slice(1),
    role: "Agent",
    status: a.lastActivity && new Date(a.lastActivity) > new Date(Date.now() - 3600000) ? "active" : "standby",
    sessions: a.sessionCount,
    lastActivity: a.lastActivity,
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
export const getVpsNodes = (): Promise<VpsNode[]> => {
  if (USE_MOCK) return delay(mockNodes);
  return http<any>("/api/vps").then(data => {
    console.log("[getVpsNodes] raw data:", data);
    return [{
      id: "vps-1",
      name: "openclaw-vps",
      region: "Hetzner · Helsinki",
      cpu: typeof data.cpu === "number" ? data.cpu : parseFloat(data.cpu) || 0,
      ram: typeof data.ram === "number" ? data.ram : (() => { const [u, t] = (data.ramRaw || "0/0").split("/").map((x: string) => parseFloat(x)); return Math.round((u / t) * 100); })(),
      ramRaw: data.ramRaw || ((data.ram || "0/0").toString()),
      disk: typeof data.disk === "number" ? data.disk : parseInt(data.disk) || 0,
      status: data.ram !== "N/A" ? "online" as const : "offline" as const,
      uptime: data.uptime ? data.uptime.replace("up ", "") : "N/A",
      containers: Array.isArray(data.containers) ? data.containers : [],
    }];
  });
};
export type VpsAction = "restart" | "snapshot" | "scale";
export const vpsAction = (id: string, action: VpsAction) =>
  USE_MOCK ? delay({ ok: true, id, action }, 500)
           : http(`/api/vps/nodes/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });

/* Audit */
export const getAuditTrail = (limit = 50): Promise<ActivityEvent[]> => {
  if (USE_MOCK) return delay(mockActivity);
  return http<any[]>(`/api/activity?limit=${limit}`).then(data => {
    console.log("[getAuditTrail] raw data:", data);
    // Backend returns [{"type":"log","text":"Ativou protocolo...","source":"CEO","timestamp":"06:33:43"}]
    return data.map((e: any) => ({
      id: `audit-${Date.now()}-${Math.random()}`,
      type: e.type || "log",
      text: e.text || e.message || "",
      source: e.source || "sistema",
      timestamp: e.timestamp || new Date().toISOString(),
      severity: e.severity || "info",
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
  name: string;          // sshd, nginx-http-auth, recidive, ...
  enabled: boolean;
  filter: string;
  findtime: number;      // seconds
  bantime: number;       // seconds
  maxretry: number;
  currentlyBanned: number;
  totalBanned: number;
  failed: number;
}
export interface BannedIp {
  ip: string;
  jail: string;
  country?: string;
  countryCode?: string;
  attempts: number;
  bannedAt: string;      // ISO
  expiresAt?: string;    // ISO; omit for permanent
  reason?: string;
}
export interface Fail2banStats {
  totalBanned: number;
  bannedLast24h: number;
  failedLast24h: number;
  jailsActive: number;
  topCountries: { code: string; name: string; count: number }[];
  attackTimeline: { hour: string; attempts: number; bans: number }[];   // last 24h
}

const mockJails: Fail2banJail[] = [
  { name: "sshd", enabled: true, filter: "sshd", findtime: 600, bantime: 3600, maxretry: 5, currentlyBanned: 12, totalBanned: 247, failed: 1342 },
  { name: "nginx-http-auth", enabled: true, filter: "nginx-http-auth", findtime: 600, bantime: 7200, maxretry: 3, currentlyBanned: 4, totalBanned: 89, failed: 312 },
  { name: "nginx-botsearch", enabled: true, filter: "nginx-botsearch", findtime: 600, bantime: 14400, maxretry: 2, currentlyBanned: 7, totalBanned: 156, failed: 487 },
  { name: "recidive", enabled: true, filter: "recidive", findtime: 86400, bantime: 604800, maxretry: 5, currentlyBanned: 3, totalBanned: 31, failed: 31 },
  { name: "postfix", enabled: false, filter: "postfix", findtime: 600, bantime: 3600, maxretry: 5, currentlyBanned: 0, totalBanned: 12, failed: 47 },
];

const now = Date.now();
const mockBanned: BannedIp[] = [
  { ip: "185.220.101.42", jail: "sshd", country: "Russia", countryCode: "RU", attempts: 27, bannedAt: new Date(now - 1000 * 60 * 4).toISOString(), expiresAt: new Date(now + 1000 * 60 * 56).toISOString(), reason: "5 falhas em 600s" },
  { ip: "45.155.205.231", jail: "sshd", country: "Netherlands", countryCode: "NL", attempts: 14, bannedAt: new Date(now - 1000 * 60 * 12).toISOString(), expiresAt: new Date(now + 1000 * 60 * 48).toISOString(), reason: "5 falhas em 600s" },
  { ip: "218.92.0.56", jail: "sshd", country: "China", countryCode: "CN", attempts: 89, bannedAt: new Date(now - 1000 * 60 * 22).toISOString(), expiresAt: new Date(now + 1000 * 60 * 38).toISOString(), reason: "brute-force persistente" },
  { ip: "103.233.10.18", jail: "nginx-http-auth", country: "India", countryCode: "IN", attempts: 8, bannedAt: new Date(now - 1000 * 60 * 35).toISOString(), expiresAt: new Date(now + 1000 * 60 * 85).toISOString(), reason: "3 falhas em 600s" },
  { ip: "62.210.85.143", jail: "nginx-botsearch", country: "France", countryCode: "FR", attempts: 12, bannedAt: new Date(now - 1000 * 60 * 48).toISOString(), expiresAt: new Date(now + 1000 * 60 * 192).toISOString(), reason: "scanner de exploits" },
  { ip: "194.26.135.21", jail: "recidive", country: "Romania", countryCode: "RO", attempts: 156, bannedAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(), expiresAt: new Date(now + 1000 * 60 * 60 * 166).toISOString(), reason: "reincidente · 7 dias" },
  { ip: "92.118.39.74", jail: "sshd", country: "United States", countryCode: "US", attempts: 6, bannedAt: new Date(now - 1000 * 60 * 78).toISOString(), expiresAt: new Date(now + 1000 * 60 * (-18)).toISOString(), reason: "5 falhas em 600s" },
];

const mockStats: Fail2banStats = {
  totalBanned: 26,
  bannedLast24h: 47,
  failedLast24h: 1893,
  jailsActive: 4,
  topCountries: [
    { code: "CN", name: "China", count: 18 },
    { code: "RU", name: "Russia", count: 11 },
    { code: "US", name: "United States", count: 6 },
    { code: "IN", name: "India", count: 5 },
    { code: "BR", name: "Brazil", count: 4 },
  ],
  attackTimeline: Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, "0")}:00`,
    attempts: Math.floor(40 + Math.random() * 120 + (i > 18 || i < 4 ? 80 : 0)),
    bans: Math.floor(Math.random() * 5 + (i > 18 || i < 4 ? 3 : 0)),
  })),
};

export const getFail2banJails = (): Promise<Fail2banJail[]> =>
  USE_MOCK ? delay(mockJails) : http("/api/fail2ban/jails");

export const getFail2banBanned = (): Promise<BannedIp[]> =>
  USE_MOCK ? delay(mockBanned) : http("/api/fail2ban/banned");

export const getFail2banStats = (): Promise<Fail2banStats> =>
  USE_MOCK ? delay(mockStats) : http("/api/fail2ban/stats");

export const unbanIp = (ip: string, jail: string) =>
  USE_MOCK ? delay({ ok: true, ip, jail }, 400)
           : http("/api/fail2ban/unban", { method: "POST", body: JSON.stringify({ ip, jail }) });

/* Memory - N/A, no real backend endpoint */
export interface MemoryEntry { id: string; agent: string; content: string; timestamp: string; }
export const getMemory = async (): Promise<MemoryEntry[]> => [];
