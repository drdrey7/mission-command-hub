/**
 * Openclaw Mission Control — API client
 *
 * Swap `USE_MOCK = false` (or set VITE_OPENCLAW_API_URL) once your backend
 * is reachable. All UI talks to this module — components never import
 * mock data directly for live features.
 *
 * Expected backend (REST + JSON). All routes prefixed with VITE_OPENCLAW_API_URL.
 *   GET    /agents
 *   GET    /missions
 *   POST   /missions                       { codename, objective, lead, squad, priority, eta }
 *   POST   /missions/:id/abort
 *   GET    /tasks
 *   GET    /vps/nodes
 *   POST   /vps/nodes/:id/action           { action: "restart"|"snapshot"|"scale" }
 *   GET    /audit?limit=50
 *   GET    /notifications
 *   POST   /system/kill-switch             { reason }
 *   POST   /system/resume
 *   POST   /chat/:agent                    { messages: [{role, content}] }  -> { reply }
 *
 * Auth: Bearer token in localStorage `openclaw_token` (or set VITE_OPENCLAW_TOKEN).
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

const API_URL = import.meta.env.VITE_OPENCLAW_API_URL as string | undefined;
const TOKEN = (import.meta.env.VITE_OPENCLAW_TOKEN as string | undefined) ?? "";
export const USE_MOCK = !API_URL;

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = TOKEN || localStorage.getItem("openclaw_token") || "";
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

const delay = <T,>(v: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(v), ms));

/* ------------------- Agents ------------------- */
export const getAgents = (): Promise<Agent[]> =>
  USE_MOCK ? delay(mockAgents) : http<Agent[]>("/agents");

/* ------------------- Tasks ------------------- */
export const getTasks = (): Promise<Task[]> =>
  USE_MOCK ? delay(mockTasks) : http<Task[]>("/tasks");

/* ------------------- Missions ------------------- */
export interface NewMissionInput {
  codename: string;
  objective: string;
  lead: AgentKey;
  squad: AgentKey[];
  priority: "alta" | "média" | "baixa";
  eta: string;
}
export const getMissions = (): Promise<Mission[]> =>
  USE_MOCK ? delay(mockMissions) : http<Mission[]>("/missions");

export const createMission = async (input: NewMissionInput): Promise<Mission> => {
  if (USE_MOCK) {
    return delay({
      id: `MX-${String(Math.floor(Math.random() * 900) + 100)}`,
      codename: input.codename,
      objective: input.objective,
      lead: input.lead,
      squad: input.squad,
      status: "preparando" as const,
      progress: 0,
      eta: input.eta,
    });
  }
  return http<Mission>("/missions", { method: "POST", body: JSON.stringify(input) });
};

export const abortMission = (id: string) =>
  USE_MOCK ? delay({ ok: true }) : http(`/missions/${id}/abort`, { method: "POST" });

/* ------------------- VPS ------------------- */
export const getVpsNodes = (): Promise<VpsNode[]> =>
  USE_MOCK ? delay(mockNodes) : http<VpsNode[]>("/vps/nodes");

export type VpsAction = "restart" | "snapshot" | "scale";
export const vpsAction = (id: string, action: VpsAction) =>
  USE_MOCK
    ? delay({ ok: true, id, action }, 500)
    : http(`/vps/nodes/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });

/* ------------------- Audit / Activity ------------------- */
export const getAuditTrail = (limit = 50): Promise<ActivityEvent[]> =>
  USE_MOCK ? delay(mockActivity) : http<ActivityEvent[]>(`/audit?limit=${limit}`);

/* ------------------- Notifications ------------------- */
export interface Notification {
  id: string;
  title: string;
  body: string;
  level: "info" | "warning" | "critical";
  agent?: AgentKey | "sistema";
  time: string;
  read?: boolean;
}
const mockNotifications: Notification[] = [
  { id: "n1", title: "Skyhawk em voo", body: "Mission MX-001 progrediu para 64%.", level: "info", agent: "comandante", time: "agora" },
  { id: "n2", title: "Pico de CPU", body: "openclaw-ai-04 atingiu 88% por 5 min.", level: "warning", agent: "cyber", time: "há 4 min" },
  { id: "n3", title: "Backup OK", body: "Snapshot diário concluído com sucesso.", level: "info", agent: "sistema", time: "03:00" },
];
export const getNotifications = (): Promise<Notification[]> =>
  USE_MOCK ? delay(mockNotifications) : http<Notification[]>("/notifications");

/* ------------------- Kill switch ------------------- */
export const killSwitch = (reason: string) =>
  USE_MOCK ? delay({ ok: true, reason }, 600) : http("/system/kill-switch", { method: "POST", body: JSON.stringify({ reason }) });

export const resumeOps = () =>
  USE_MOCK ? delay({ ok: true }, 400) : http("/system/resume", { method: "POST" });

/* ------------------- Chat ------------------- */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
const cannedReplies: Record<AgentKey, string[]> = {
  comandante: [
    "Confirmado. Estou a coordenar com o esquadrão e devolvo briefing em minutos.",
    "Aprovação registada. Vou priorizar isto na próxima janela operacional.",
  ],
  cyber: [
    "A executar varredura. Detectei 0 anomalias críticas — relatório completo em 2 min.",
    "Política de acesso reforçada. MFA obrigatório aplicado a todos os endpoints.",
  ],
  flow: [
    "Workflow agendado. Próxima execução em 14:00 com retries automáticos.",
    "Integração validada. Stripe → Notion → ERP funcionando end-to-end.",
  ],
  ledger: [
    "Reconciliação iniciada. 142 lançamentos pendentes, ETA 18 min.",
    "Fechamento contábil OK. Sem discrepâncias acima do limiar definido.",
  ],
};

export const sendChat = async (agent: AgentKey, messages: ChatMessage[]): Promise<{ reply: string }> => {
  if (USE_MOCK) {
    const pool = cannedReplies[agent];
    const reply = pool[Math.floor(Math.random() * pool.length)];
    return delay({ reply }, 700);
  }
  return http(`/chat/${agent}`, { method: "POST", body: JSON.stringify({ messages }) });
};
