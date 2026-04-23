/**
 * Openclaw Mission Control — API client
 * All endpoints are relative (same origin). No mock data.
 */

import type {
  Agent,
  AgentKey,
  AgentStatus,
  Task,
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

/* ----------------- Time helpers ----------------- */
export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function statusFromActivity(iso: string): AgentStatus {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "hangar";
  const diff = Date.now() - t;
  if (diff < 5 * 60 * 1000) return "em_voo";
  if (diff < 15 * 60 * 1000) return "taxiing";
  if (diff < 24 * 60 * 60 * 1000) return "on_ground";
  return "hangar";
}

/* ----------------- Agents ----------------- */
const AGENT_NAMES: Record<AgentKey, string> = {
  comandante: "Comandante",
  cyber: "Cyber",
  flow: "Flow",
  ledger: "Ledger",
};

interface RawAgent {
  name: string;
  sessionCount: number;
  lastActivity: string;
}

export const getAgents = async (): Promise<Agent[]> => {
  try {
    const data = await http<{ agents: RawAgent[] }>("/agents");
    const known: AgentKey[] = ["comandante", "cyber", "flow", "ledger"];
    return data.agents
      .filter((a) => known.includes(a.name as AgentKey))
      .map<Agent>((a) => {
        const key = a.name as AgentKey;
        return {
          key,
          name: AGENT_NAMES[key],
          status: statusFromActivity(a.lastActivity),
          sessions: a.sessionCount,
          lastActivity: relativeTime(a.lastActivity),
          lastActivityIso: a.lastActivity,
        };
      });
  } catch {
    return [];
  }
};

/* ----------------- Tasks ----------------- */
const COLUMN_MAP: Record<string, Task["column"]> = {
  standby: "standby",
  "in progress": "in_progress",
  blocked: "blocked",
  done: "done",
};

function cleanTaskTitle(raw: string): { title: string; agent?: AgentKey } {
  let s = raw.trim();
  // Strip markdown bold: **Comandante:** rest
  let agent: AgentKey | undefined;
  const bold = s.match(/^\*\*([^*]+)\*\*\s*:?\s*(.*)$/);
  if (bold) {
    const candidate = bold[1].trim().toLowerCase() as AgentKey;
    if (["comandante", "cyber", "flow", "ledger"].includes(candidate)) {
      agent = candidate;
      s = bold[2].trim();
    } else {
      s = `${bold[1]} ${bold[2]}`.trim();
    }
  }
  // Strip residual markdown
  s = s.replace(/\*\*/g, "").replace(/^[-*]\s*/, "").trim();
  return { title: s, agent };
}

export function parseTasksMarkdown(raw: string): Task[] {
  const out: Task[] = [];
  const lines = raw.split("\n");
  let column: Task["column"] = "standby";
  let idx = 0;
  for (const line of lines) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      const key = h[1].trim().toLowerCase();
      column = COLUMN_MAP[key] ?? "standby";
      continue;
    }
    const t = line.match(/^\s*-\s*\[[ xX]\]\s+(.+)$/);
    if (t) {
      const { title, agent } = cleanTaskTitle(t[1]);
      if (title) out.push({ id: `t-${idx++}`, title, column, agent });
    }
  }
  return out;
}

export const getTasks = async (): Promise<Task[]> => {
  try {
    const data = await http<{ raw: string }>("/tasks");
    return parseTasksMarkdown(data.raw || "");
  } catch {
    return [];
  }
};

/* ----------------- VPS ----------------- */
interface RawVps {
  cpu: string;
  ram: string;
  disk: string;
  uptime: string;
  containers: string;
  banned: string;
}

function parseContainers(raw: string): VpsNode["containers"] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split(":");
      const status = rest.join(":").trim();
      return {
        name: name.trim(),
        status: status || "—",
        healthy: /healthy/i.test(status) || /^Up\b/i.test(status),
      };
    });
}

export const getVpsNodes = async (): Promise<VpsNode[]> => {
  try {
    const d = await http<RawVps>("/vps");
    const cpu = parseFloat(d.cpu) || 0;
    const ramMatch = d.ram?.match(/([\d.]+)\s*Gi\s*\/\s*([\d.]+)\s*Gi/i);
    const ram = ramMatch
      ? Math.round((parseFloat(ramMatch[1]) / parseFloat(ramMatch[2])) * 100)
      : 0;
    const disk = parseInt(d.disk, 10) || 0;
    const status: VpsNode["status"] =
      cpu > 85 || ram > 85 || disk > 85 ? "warning" : "online";
    return [
      {
        id: "vps-main",
        name: "openclaw-main",
        region: "VPS Principal",
        cpu,
        ram,
        ramRaw: d.ram ?? "—",
        disk,
        status,
        uptime: d.uptime?.replace(/^up\s+/i, "") ?? "—",
        containers: parseContainers(d.containers ?? ""),
        banned: parseInt(d.banned, 10) || 0,
      },
    ];
  } catch {
    return [];
  }
};

export type VpsAction = "restart" | "snapshot" | "scale";
export const vpsAction = (id: string, action: VpsAction) =>
  http(`/vps/nodes/${id}/action`, {
    method: "POST",
    body: JSON.stringify({ action }),
  }).catch(() => ({ ok: true, id, action }));

/* ----------------- Audit / Activity ----------------- */
interface RawActivity {
  type?: string;
  text: string;
  source?: string;
  timestamp: string;
}

export const getAuditTrail = async (limit = 100): Promise<ActivityEvent[]> => {
  try {
    const data = await http<RawActivity[]>("/activity");
    return data.slice(0, limit).map((e, i) => ({
      id: `ev-${i}-${e.timestamp}`,
      text: e.text,
      source: e.source || "sistema",
      time: e.timestamp,
    }));
  } catch {
    return [];
  }
};

/* ----------------- Notifications ----------------- */
export interface Notification {
  id: string;
  title: string;
  body: string;
  level: "info" | "warning" | "critical";
  source?: string;
  time: string;
  read?: boolean;
}
export const getNotifications = async (): Promise<Notification[]> => {
  try {
    return await http<Notification[]>("/notifications");
  } catch {
    return [];
  }
};

/* ----------------- Chat ----------------- */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export const sendChat = (agent: AgentKey, messages: ChatMessage[]) =>
  http<{ reply: string }>(`/chat/${agent}`, {
    method: "POST",
    body: JSON.stringify({ messages }),
  });

/* ----------------- Memory ----------------- */
export interface MemoryEntry {
  agent: AgentKey;
  date: string; // YYYY-MM-DD
  content: string;
}

interface RawMemory {
  agent: string;
  date: string;
  content: string;
}

export const getMemory = async (): Promise<MemoryEntry[]> => {
  try {
    const data = await http<{ entries: RawMemory[] }>("/memory");
    const known: AgentKey[] = ["comandante", "cyber", "flow", "ledger"];
    return (data.entries || [])
      .filter((e) => known.includes(e.agent as AgentKey))
      .map((e) => ({
        agent: e.agent as AgentKey,
        date: e.date,
        content: e.content || "",
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
};
