/**
 * Openclaw Mission Control — API client
 * Backend served at same origin under /api/*
 */

import {
  missions as mockMissions,
  Agent,
  AgentKey,
  Task,
  Mission,
  VpsNode,
  ActivityEvent,
} from "@/data/mockData";

export const USE_MOCK = false;
const API_BASE = "/api";
const TOKEN = (import.meta.env.VITE_OPENCLAW_TOKEN as string | undefined) ?? "";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = TOKEN || localStorage.getItem("openclaw_token") || "";
  const res = await fetch(`${API_BASE}${path}`, {
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

/* ----------------- Agents ----------------- */
const AGENT_META: Record<AgentKey, { name: string; role: string }> = {
  comandante: { name: "Comandante", role: "Líder da Operação" },
  cyber: { name: "Cyber", role: "Segurança & Compliance" },
  flow: { name: "Flow", role: "Automação de Processos" },
  ledger: { name: "Ledger", role: "Finanças & Registros" },
};

interface RawAgent {
  name: string;
  sessionCount: number;
  lastActivity: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function statusFromActivity(iso: string): Agent["status"] {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60 * 60 * 1000) return "active";
  if (diff < 24 * 60 * 60 * 1000) return "standby";
  return "idle"; // map "offline" → "idle" (closest existing status)
}

export const getAgents = async (): Promise<Agent[]> => {
  const data = await http<{ agents: RawAgent[] }>("/agents");
  return data.agents
    .filter((a) => (a.name as AgentKey) in AGENT_META)
    .map((a) => {
      const key = a.name as AgentKey;
      const meta = AGENT_META[key];
      return {
        key,
        name: meta.name,
        role: meta.role,
        status: statusFromActivity(a.lastActivity),
        sessions: a.sessionCount,
        lastActivity: relativeTime(a.lastActivity),
      };
    });
};

/* ----------------- Tasks ----------------- */
function parseTasksMarkdown(raw: string): Task[] {
  const out: Task[] = [];
  const lines = raw.split("\n");
  let section = "";
  let idx = 0;
  const sectionToPriority = (s: string): Task["priority"] => {
    const k = s.toLowerCase();
    if (k.includes("progress")) return "alta";
    if (k.includes("blocked")) return "alta";
    if (k.includes("standby")) return "média";
    return "baixa";
  };
  const sectionToTime = (s: string): string => s.toLowerCase().replace(/^#+\s*/, "").trim();
  for (const line of lines) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) { section = h[1].trim(); continue; }
    const t = line.match(/^\s*-\s*\[[ xX]\]\s+(.+)$/);
    if (t && section.toLowerCase() !== "done") {
      out.push({
        id: `t-${idx++}`,
        title: t[1].trim(),
        agent: "comandante",
        priority: sectionToPriority(section),
        time: sectionToTime(section),
      });
    }
  }
  return out;
};

export const getTasks = async (): Promise<Task[]> => {
  const data = await http<{ raw: string }>("/tasks");
  return parseTasksMarkdown(data.raw || "");
};

/* ----------------- Missions (mock — no backend endpoint yet) ----------------- */
export interface NewMissionInput {
  codename: string; objective: string; lead: AgentKey; squad: AgentKey[];
  priority: "alta" | "média" | "baixa"; eta: string;
}
export const getMissions = (): Promise<Mission[]> => delay(mockMissions);
export const createMission = async (input: NewMissionInput): Promise<Mission> =>
  delay({
    id: `MX-${String(Math.floor(Math.random() * 900) + 100)}`,
    codename: input.codename, objective: input.objective,
    lead: input.lead, squad: input.squad,
    status: "preparando" as const, progress: 0, eta: input.eta,
  });
export const abortMission = (_id: string) => delay({ ok: true });

/* ----------------- VPS ----------------- */
interface RawVps {
  cpu: string; ram: string; disk: string; uptime: string;
  containers: string; banned: string;
}

export const getVpsNodes = async (): Promise<VpsNode[]> => {
  const d = await http<RawVps>("/vps");
  const cpu = parseFloat(d.cpu) || 0;
  // RAM "2.0Gi/7.6Gi" → percentage
  const ramMatch = d.ram.match(/([\d.]+)\s*Gi\s*\/\s*([\d.]+)\s*Gi/i);
  const ram = ramMatch ? Math.round((parseFloat(ramMatch[1]) / parseFloat(ramMatch[2])) * 100) : 0;
  const disk = parseFloat(d.disk) || 0;
  const status: VpsNode["status"] = cpu > 85 || ram > 85 || disk > 85 ? "warning" : "online";
  return [{
    id: "vps-main",
    name: "openclaw-main",
    region: "VPS Principal",
    cpu, ram, disk,
    status,
    uptime: d.uptime?.replace(/^up\s+/i, "") ?? "—",
  }];
};

export type VpsAction = "restart" | "snapshot" | "scale";
export const vpsAction = (id: string, action: VpsAction) =>
  http(`/vps/nodes/${id}/action`, { method: "POST", body: JSON.stringify({ action }) }).catch(() =>
    ({ ok: true, id, action })
  );

/* ----------------- Audit / Activity ----------------- */
interface RawActivity {
  type?: string;
  text: string;
  source?: string;
  timestamp: string;
}

export const getAuditTrail = async (limit = 50): Promise<ActivityEvent[]> => {
  const data = await http<RawActivity[]>("/activity");
  const known: AgentKey[] = ["comandante", "cyber", "flow", "ledger"];
  return data.slice(0, limit).map((e, i) => {
    const src = (e.source || "sistema").toLowerCase();
    const agent = (known.find((k) => src.includes(k)) ?? "sistema") as ActivityEvent["agent"];
    return {
      id: `ev-${i}-${e.timestamp}`,
      text: e.text,
      agent,
      time: e.timestamp,
    };
  });
};

/* ----------------- Notifications ----------------- */
export interface Notification {
  id: string; title: string; body: string;
  level: "info" | "warning" | "critical";
  agent?: AgentKey | "sistema"; time: string; read?: boolean;
}
export const getNotifications = async (): Promise<Notification[]> => {
  try {
    return await http<Notification[]>("/notifications");
  } catch {
    return [];
  }
};

/* ----------------- Chat ----------------- */
export interface ChatMessage { role: "user" | "assistant"; content: string; }
export const sendChat = (agent: AgentKey, messages: ChatMessage[]) =>
  http<{ reply: string }>(`/chat/${agent}`, { method: "POST", body: JSON.stringify({ messages }) });

/* ----------------- Fail2ban ----------------- */
export interface Fail2banJail {
  name: string; enabled: boolean; filter: string;
  findtime: number; bantime: number; maxretry: number;
  currentlyBanned: number; totalBanned: number; failed: number;
}
export interface BannedIp {
  ip: string; jail: string; country?: string; countryCode?: string;
  attempts: number; bannedAt: string; expiresAt?: string; reason?: string;
}
export interface Fail2banStats {
  totalBanned: number; bannedLast24h: number; failedLast24h: number;
  jailsActive: number;
  topCountries: { code: string; name: string; count: number }[];
  attackTimeline: { hour: string; attempts: number; bans: number }[];
}

export const getFail2banJails = (): Promise<Fail2banJail[]> => http("/fail2ban/jails");
export const getFail2banBanned = (): Promise<BannedIp[]> => http("/fail2ban/banned");
export const getFail2banStats = (): Promise<Fail2banStats> => http("/fail2ban/stats");
export const unbanIp = (ip: string, jail: string) =>
  http("/fail2ban/unban", { method: "POST", body: JSON.stringify({ ip, jail }) });
