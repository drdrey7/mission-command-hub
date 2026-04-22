export type AgentKey = "comandante" | "cyber" | "flow" | "ledger";
export type AgentStatus = "active" | "standby" | "idle";

export interface Agent {
  key: AgentKey;
  name: string;
  role: string;
  status: AgentStatus;
  sessions: number;
  lastActivity: string;
}

export const agents: Agent[] = [
  {
    key: "comandante",
    name: "Comandante",
    role: "Líder da Operação",
    status: "active",
    sessions: 24,
    lastActivity: "há 2 min",
  },
  {
    key: "cyber",
    name: "Cyber",
    role: "Segurança & Compliance",
    status: "active",
    sessions: 18,
    lastActivity: "há 5 min",
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
  agent: AgentKey | "sistema";
  time: string;
}

export const recentActivity: ActivityEvent[] = [
  { id: "a1", text: "Integração com ERP concluída com sucesso", agent: "flow", time: "09:41" },
  { id: "a2", text: "Novo acesso de administrador detectado", agent: "cyber", time: "09:38" },
  { id: "a3", text: "Aprovação de orçamento realizada", agent: "comandante", time: "09:33" },
  { id: "a4", text: "Lançamento contábil importado", agent: "ledger", time: "09:28" },
  { id: "a5", text: "Backup diário finalizado", agent: "sistema", time: "03:00" },
  { id: "a6", text: "Verificação de compliance executada", agent: "cyber", time: "02:14" },
];
