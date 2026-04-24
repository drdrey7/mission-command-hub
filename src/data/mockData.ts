export type AgentKey = "comandante" | "cyber" | "flow" | "ledger" | "agentmail";
export type AgentStatus = "active" | "standby" | "idle" | "working" | "em_voo" | "taxiing" | "hangar" | "on_ground";

export interface Agent {
  key: AgentKey;
  name: string;
  role: string;
  status: AgentStatus;
  sessions: number;
  lastActivity: string;
  /** Epoch ms when current task started; only present when status === "working" */
  flightStartedAt?: number;
  currentTask?: string;
}

const now = Date.now();

export const agents: Agent[] = [
  {
    key: "comandante",
    name: "Comandante",
    role: "Líder da Operação",
    status: "working",
    sessions: 24,
    lastActivity: "agora",
    flightStartedAt: now - 1000 * 60 * 47,
    currentTask: "Coordenando aprovações executivas",
  },
  {
    key: "cyber",
    name: "Cyber",
    role: "Segurança & Compliance",
    status: "working",
    sessions: 18,
    lastActivity: "agora",
    flightStartedAt: now - 1000 * 60 * 12,
    currentTask: "Varredura de vulnerabilidades VPS",
  },
  {
    key: "flow",
    name: "Flow",
    role: "Automação de Processos",
    status: "active",
    sessions: 31,
    lastActivity: "há 1 min",
  },
  {
    key: "ledger",
    name: "Ledger",
    role: "Finanças & Registros",
    status: "standby",
    sessions: 9,
    lastActivity: "há 18 min",
  },
];

export interface Task {
  id: string;
  title: string;
  agent: AgentKey;
  priority: "alta" | "média" | "baixa";
  time: string;
}

export const tasks: Task[] = [
  { id: "t1", title: "Revisar aprovações pendentes", agent: "comandante", priority: "alta", time: "10:00" },
  { id: "t2", title: "Verificar alertas de segurança", agent: "cyber", priority: "alta", time: "11:30" },
  { id: "t3", title: "Executar integrações agendadas", agent: "flow", priority: "média", time: "14:00" },
  { id: "t4", title: "Conferir lançamentos contábeis", agent: "ledger", priority: "média", time: "16:00" },
  { id: "t5", title: "Auditoria de acessos semanal", agent: "cyber", priority: "baixa", time: "17:00" },
];

export interface SystemMetric {
  label: string;
  status: "online" | "warning" | "offline";
  value: string;
}

export const systemMetrics: SystemMetric[] = [
  { label: "Servidores VPS", status: "online", value: "100%" },
  { label: "Base de Dados", status: "online", value: "100%" },
  { label: "Integrações", status: "online", value: "98%" },
  { label: "Segurança", status: "online", value: "Protegido" },
  { label: "Backups", status: "online", value: "Atualizado" },
  { label: "Performance", status: "online", value: "98%" },
];

export interface ActivityEvent {
  id: string;
  text: string;
  source: AgentKey | "sistema";
  time: string;
  agent?: AgentKey | "sistema";
}

export const recentActivity: ActivityEvent[] = [
  { id: "a1", text: "Integração com ERP concluída com sucesso", source: "flow", agent: "flow", time: "09:41" },
  { id: "a2", text: "Novo acesso de administrador detectado", source: "cyber", agent: "cyber", time: "09:38" },
  { id: "a3", text: "Aprovação de orçamento realizada", source: "comandante", agent: "comandante", time: "09:33" },
  { id: "a4", text: "Lançamento contábil importado", source: "ledger", agent: "ledger", time: "09:28" },
  { id: "a5", text: "Backup diário finalizado", source: "sistema", agent: "sistema", time: "03:00" },
  { id: "a6", text: "Verificação de compliance executada", source: "cyber", agent: "cyber", time: "02:14" },
];

/* ---------- Tabs data ---------- */

export interface MemoryEntry {
  id: string;
  agent: AgentKey;
  key: string;
  value: string;
  updated: string;
}

export const memoryEntries: MemoryEntry[] = [
  { id: "m1", agent: "comandante", key: "tom_de_voz", value: "formal, objetivo, decisivo", updated: "há 2h" },
  { id: "m2", agent: "comandante", key: "prioridades_q4", value: "expansão Ibérica · margem 22%", updated: "ontem" },
  { id: "m3", agent: "cyber", key: "politica_acesso", value: "MFA obrigatório · zero-trust", updated: "há 4h" },
  { id: "m4", agent: "cyber", key: "ips_bloqueados", value: "37 entradas em watchlist", updated: "há 12 min" },
  { id: "m5", agent: "flow", key: "integracoes_ativas", value: "Stripe · Notion · n8n · ERP", updated: "há 1h" },
  { id: "m6", agent: "ledger", key: "plano_de_contas", value: "SNC · 142 rubricas", updated: "há 3d" },
];

export interface Container {
  name: string;
  status: string;
  healthy: boolean;
}

export interface VpsNode {
  id: string;
  name: string;
  region: string;
  cpu: number;
  ram: number;
  ramRaw: string;
  disk: number;
  status: "online" | "warning" | "offline";
  uptime: string;
  containers: Container[];
}

export const vpsNodes: VpsNode[] = [
  { id: "n1", name: "openclaw-edge-01", region: "Lisboa · PT", cpu: 34, ram: 58, ramRaw: "2.1Gi/7.6Gi", disk: 41, status: "online", uptime: "62d 04h", containers: [{ name: "openclaw-gateway", status: "Up 62d", healthy: true }] },
  { id: "n2", name: "openclaw-core-02", region: "Frankfurt · DE", cpu: 71, ram: 64, ramRaw: "4Gi/16Gi", disk: 52, status: "online", uptime: "120d 11h", containers: [{ name: "n8n", status: "Up 120d", healthy: true }] },
  { id: "n3", name: "openclaw-data-03", region: "Amsterdam · NL", cpu: 22, ram: 47, ramRaw: "6Gi/12Gi", disk: 78, status: "warning", uptime: "30d 02h", containers: [] },
  { id: "n4", name: "openclaw-ai-04", region: "Paris · FR", cpu: 88, ram: 81, ramRaw: "8Gi/10Gi", disk: 33, status: "online", uptime: "8d 19h", containers: [] },
];

export interface Mission {
  id: string;
  codename: string;
  objective: string;
  lead: AgentKey;
  squad: AgentKey[];
  status: "em_voo" | "preparando" | "concluido" | "abortado";
  progress: number;
  eta: string;
}

export const missions: Mission[] = [
  {
    id: "MX-001",
    codename: "Skyhawk",
    objective: "Onboarding automatizado de 3 novos clientes enterprise",
    lead: "comandante",
    squad: ["comandante", "flow", "ledger"],
    status: "em_voo",
    progress: 64,
    eta: "2h 14m",
  },
  {
    id: "MX-002",
    codename: "Ironshield",
    objective: "Hardening completo da infraestrutura VPS",
    lead: "cyber",
    squad: ["cyber", "flow"],
    status: "em_voo",
    progress: 38,
    eta: "5h 02m",
  },
  {
    id: "MX-003",
    codename: "Goldstream",
    objective: "Reconciliação contábil trimestral Q3",
    lead: "ledger",
    squad: ["ledger", "comandante"],
    status: "preparando",
    progress: 8,
    eta: "amanhã 09:00",
  },
  {
    id: "MX-004",
    codename: "Nightowl",
    objective: "Migração de logs para data lake",
    lead: "flow",
    squad: ["flow", "cyber"],
    status: "concluido",
    progress: 100,
    eta: "concluído",
  },
];
