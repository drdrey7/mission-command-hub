import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Brain,
  ClipboardList,
  FileText,
  Home,
  LayoutGrid,
  MessageCircle,
  Plane,
  RadioTower,
  Server,
  Shield,
} from "lucide-react";
import { TopBar } from "@/components/mission/TopBar";
import { CommandFooter } from "@/components/mission/CommandFooter";
import { AgentChat } from "@/components/mission/AgentChat";
import { AgentBadge } from "@/components/mission/AgentBadge";
import { StatusBadge } from "@/components/mission/StatusBadge";
import { TasksTab } from "@/components/mission/TasksTab";
import { MemoryTab } from "@/components/mission/MemoryTab";
import { VpsPanel } from "@/components/mission/VpsPanel";
import { Fail2banPanel } from "@/components/mission/Fail2banPanel";
import { AuditTrail } from "@/components/mission/AuditTrail";
import { Button } from "@/components/ui/button";
import { getNotifications, getOpenClawState, type Notification } from "@/services/api";
import type { Agent } from "@/data/mockData";
import { cn } from "@/lib/utils";

type PrimaryArea = "home" | "tasks" | "hub" | "memory" | "chat";
type ModuleArea = "vps" | "fail2ban" | "audit";
type Area = PrimaryArea | ModuleArea;

const PRIMARY_NAV: Array<{ key: PrimaryArea; label: string; icon: typeof Home }> = [
  { key: "home", label: "Home", icon: Home },
  { key: "tasks", label: "Tasks", icon: ClipboardList },
  { key: "hub", label: "Hub", icon: LayoutGrid },
  { key: "memory", label: "Memory", icon: Brain },
  { key: "chat", label: "Chat", icon: MessageCircle },
];

const HUB_MODULES: Array<{ key: ModuleArea; label: string; eyebrow: string; description: string; icon: typeof Server }> = [
  { key: "vps", label: "VPS", eyebrow: "Infra", description: "Snapshot real do host e containers.", icon: Server },
  { key: "fail2ban", label: "Fail2ban", eyebrow: "Security", description: "Monitor real de jails, bans e historico.", icon: Shield },
  { key: "audit", label: "Audit", eyebrow: "Timeline", description: "Actividade real e export CSV.", icon: FileText },
];

const moduleTitles: Record<ModuleArea, { title: string; subtitle: string }> = {
  vps: { title: "VPS", subtitle: "Snapshot real do servidor e containers." },
  fail2ban: { title: "Fail2ban", subtitle: "Monitor real de seguranca operacional." },
  audit: { title: "Audit", subtitle: "Timeline real de actividade do Mission Control." },
};

const isModuleArea = (area: Area): area is ModuleArea => ["vps", "fail2ban", "audit"].includes(area);

const ShellTitle = ({ area }: { area: Area }) => {
  if (area === "home") return { title: "Flight Deck", subtitle: "Um varrimento rapido: tripulacao, sinais criticos e nada mais." };
  if (area === "tasks") return { title: "Tasks", subtitle: "Board real, detalhe e dispatch." };
  if (area === "hub") return { title: "Hub", subtitle: "Launcher de modulos reais ja ligados." };
  if (area === "memory") return { title: "Memory", subtitle: "Resumos locais reais por dia e agente." };
  if (area === "chat") return { title: "Chat", subtitle: "Comunicacao real com agentes." };
  return moduleTitles[area];
};

const AttentionPanel = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const feed = await getNotifications();
        if (cancelled) return;
        setNotifications((feed.items ?? []).filter((item) => !item.read && item.level !== "info").slice(0, 3));
        setError(feed.errors?.[0] ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar alertas");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <section className="panel overflow-hidden p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-status-warning/30 bg-status-warning/10">
            <Bell className="h-4 w-4 text-status-warning" />
          </div>
          <div>
            <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-foreground">Sinais</h2>
            <p className="text-[11px] text-muted-foreground">{loading ? "radar a varrer..." : `${notifications.length} requerem atencao`}</p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-xs text-status-warning">
          {error}
        </div>
      ) : notifications.length > 0 ? (
        <div className="mt-4 space-y-2">
          {notifications.map((item) => (
            <article key={item.id} className="rounded-xl border border-border/60 bg-surface-2/40 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                </div>
                <span className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  item.level === "critical"
                    ? "border-status-offline/40 bg-status-offline/10 text-status-offline"
                    : "border-status-warning/40 bg-status-warning/10 text-status-warning",
                )}>
                  {item.level}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-status-online/25 bg-status-online/5 px-4 py-4">
          <p className="text-sm font-medium text-foreground">Cockpit limpo.</p>
          <p className="mt-1 text-xs text-muted-foreground">Sem alertas criticos por ler neste momento.</p>
        </div>
      )}
    </section>
  );
};

const AgentsSummary = ({ agents, configuredCount, onlineCount, workingCount, error }: {
  agents: Agent[];
  configuredCount: number;
  onlineCount: number;
  workingCount: number;
  error: string | null;
}) => {
  const compactAgents = agents.slice(0, 4);
  const offlineCount = Math.max(0, configuredCount - onlineCount);

  return (
    <section className="panel relative overflow-hidden p-4 sm:p-5">
      <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-agent-comandante/10 blur-3xl" />
      <div className="relative mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
            <RadioTower className="h-3.5 w-3.5 text-agent-comandante" />
            Crew status
          </div>
          <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-foreground">
            {workingCount > 0 ? `${workingCount} em operacao` : "Tripulacao em espera"}
          </h2>
        </div>
        <span className="rounded-full border border-status-online/40 bg-status-online/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-status-online">
          live
        </span>
      </div>
      {error && (
        <div className="mb-3 rounded-xl border border-status-offline/30 bg-status-offline/5 px-4 py-3 text-sm text-status-offline">
          {error}
        </div>
      )}
      <div className="relative grid grid-cols-3 gap-2">
        {[
          { label: "Online", value: onlineCount, tone: "text-status-online" },
          { label: "Working", value: workingCount, tone: workingCount > 0 ? "text-status-warning" : "text-muted-foreground" },
          { label: "Offline", value: offlineCount, tone: offlineCount > 0 ? "text-muted-foreground" : "text-status-online" },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/60 bg-surface-2/40 px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
            <p className={cn("mt-1 font-mono text-xl font-bold tabular-nums", item.tone)}>{String(item.value).padStart(2, "0")}</p>
          </div>
        ))}
      </div>

      <div className="relative mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {compactAgents.length === 0 ? (
          <p className="col-span-full rounded-xl border border-dashed border-border/60 p-5 text-center text-sm text-muted-foreground">
            Sem agentes disponiveis
          </p>
        ) : (
          compactAgents.map((agent) => (
            <article key={agent.key} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/55 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <AgentBadge agent={agent.key} working={agent.status === "em_voo"} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-semibold lowercase text-foreground">{agent.name}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">{agent.lastActivity || "-"}</p>
                </div>
              </div>
              <StatusBadge status={agent.status} />
            </article>
          ))
        )}
      </div>
    </section>
  );
};

const HubLauncher = ({ onOpenModule }: { onOpenModule: (module: ModuleArea) => void }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-4">
      {HUB_MODULES.map((module) => {
        const Icon = module.icon;
        return (
          <button
            key={module.key}
            type="button"
            onClick={() => onOpenModule(module.key)}
            className="group relative min-h-[112px] overflow-hidden rounded-2xl border border-border/60 bg-surface-1/72 p-3 text-left shadow-panel transition-smooth hover:-translate-y-0.5 hover:border-primary/55 hover:bg-surface-2/75 sm:min-h-[128px] sm:p-4"
          >
            <div className="pointer-events-none absolute -right-8 -top-10 h-20 w-20 rounded-full bg-primary/8 blur-2xl transition-smooth group-hover:bg-primary/14" />
            <div className="relative flex items-start justify-between gap-2">
              <span className="rounded-full border border-border/55 bg-background/45 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:text-[9px]">
                {module.eyebrow}
              </span>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/8 text-primary transition-smooth group-hover:border-primary/45 group-hover:bg-primary/12">
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <div className="relative mt-4">
              <h3 className="font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">{module.label}</h3>
              <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:line-clamp-2 sm:block">
                {module.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>

    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-surface-2/42 px-3 py-2.5 sm:px-4">
      <div className="min-w-0">
        <p className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Hangar Control</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {HUB_MODULES.length} modulos reais ligados
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {HUB_MODULES.map((module) => {
          const Icon = module.icon;
          return (
            <span key={module.key} className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-background/50 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
            </span>
          );
        })}
      </div>
    </div>
  </div>
);

const Index = () => {
  const [area, setArea] = useState<Area>("home");
  const [chatAgent, setChatAgent] = useState<string | undefined>();
  const [chatOpen, setChatOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [openClawState, setOpenClawState] = useState<{
    configuredAgents: number;
    onlineAgents: number;
    workingAgents: number;
    activeAgentCount: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadAgents = async () => {
      try {
        const state = await getOpenClawState();
        if (cancelled) return;
        setAgents((state.agents || []).map((a) => ({
          key: a.key as Agent["key"],
          name: a.name,
          role: a.role || "Agent",
          status: a.status as Agent["status"],
          sessions: a.sessionCount ?? a.sessions ?? 0,
          lastActivity: a.lastActivity ?? a.lastActivityAt ?? "-",
          flightStartedAt: undefined,
          currentTask: a.currentTask ?? undefined,
        })));
        setOpenClawState({
          configuredAgents: state.configuredAgents ?? state.configuredAgentCount ?? state.agents.length,
          onlineAgents: state.onlineAgents ?? state.onlineAgentCount ?? 0,
          workingAgents: state.workingAgents ?? state.workingAgentCount ?? state.activeAgentCount ?? 0,
          activeAgentCount: state.activeAgentCount ?? state.workingAgents ?? state.workingAgentCount ?? 0,
        });
        setAgentError(null);
      } catch (err) {
        if (!cancelled) setAgentError(err instanceof Error ? err.message : "Falha ao carregar agentes");
      }
    };

    void loadAgents();
    const interval = window.setInterval(() => void loadAgents(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const configuredCount = openClawState?.configuredAgents ?? agents.length;
  const onlineCount = openClawState?.onlineAgents ?? agents.length;
  const workingCount = openClawState?.workingAgents ?? openClawState?.activeAgentCount ?? 0;
  const currentTitle = ShellTitle({ area });
  const activePrimary = isModuleArea(area) ? "hub" : area;

  const goArea = (next: string) => {
    const normalized = next === "vps" || next === "fail2ban" || next === "audit" || next === "tasks" || next === "memory" || next === "chat" || next === "home" || next === "hub"
      ? next
      : "home";
    setArea(normalized);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openChat = (agentKey?: string) => {
    setChatAgent(agentKey);
    setChatOpen(true);
  };

  const content = useMemo(() => {
    if (area === "home") {
      return (
        <div className="mx-auto max-w-4xl space-y-4">
          <AgentsSummary agents={agents} configuredCount={configuredCount} onlineCount={onlineCount} workingCount={workingCount} error={agentError} />
          <AttentionPanel />
        </div>
      );
    }
    if (area === "tasks") return <TasksTab />;
    if (area === "hub") return <HubLauncher onOpenModule={goArea} />;
    if (area === "memory") return <MemoryTab />;
    if (area === "chat") return <AgentChat externalAgent={chatAgent} embedded />;
    if (area === "vps") return <VpsPanel />;
    if (area === "fail2ban") return <Fail2banPanel />;
    return <AuditTrail />;
  }, [agentError, agents, area, chatAgent, configuredCount, onlineCount, workingCount]);

  return (
    <main className="min-h-screen bg-background">
      <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
        <aside className="sticky top-0 hidden h-screen border-r border-border/60 bg-background/82 px-4 py-5 backdrop-blur-xl lg:block">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-agent-comandante/40 bg-agent-comandante/10">
              <Plane className="h-5 w-5 text-agent-comandante" />
            </div>
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground leading-none">openclaw</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground leading-none">Mission Control</p>
            </div>
          </div>

          <nav className="space-y-2">
            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              const active = activePrimary === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => goArea(item.key)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-medium transition-smooth",
                    active ? "border-primary/50 bg-primary/10 text-foreground shadow-glow-gold" : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-surface-2/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 rounded-2xl border border-border/60 bg-surface-2/40 p-3">
            <p className="px-1 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Hub modules</p>
            <div className="mt-2 space-y-1">
              {HUB_MODULES.map((module) => {
                const Icon = module.icon;
                return (
                  <button
                    key={module.key}
                    type="button"
                    onClick={() => goArea(module.key)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs transition-smooth",
                      area === module.key ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:bg-surface-3/70 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {module.label}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mx-auto max-w-[1440px] px-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] sm:px-6 lg:px-8 lg:pb-10">
            <TopBar onTabChange={goArea} onOpenChat={openChat} />

            <header className="mb-4 rounded-3xl border border-border/60 bg-surface-1/70 p-4 shadow-panel sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">
                    Mission Control
                  </p>
                  <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {currentTitle.title}
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{currentTitle.subtitle}</p>
                </div>
                {isModuleArea(area) && (
                  <Button variant="outline" onClick={() => goArea("hub")} className="w-full sm:w-auto">
                    Voltar ao Hub
                  </Button>
                )}
              </div>
            </header>

            <section className="space-y-4">
              {content}
            </section>

            <CommandFooter />
          </div>
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/88 px-3 pt-2 shadow-[0_-18px_50px_hsl(var(--background)/0.72)] backdrop-blur-2xl lg:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.55rem)" }}
        aria-label="Navegacao principal"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1.5">
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const active = activePrimary === item.key;
            const isHub = item.key === "hub";
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => goArea(item.key)}
                className={cn(
                  "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-2 text-[10px] font-semibold transition-smooth",
                  active ? "text-foreground" : "text-muted-foreground",
                  isHub && "-mt-5",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-2xl border transition-smooth",
                    isHub ? "h-14 w-14 border-primary/60 bg-primary text-primary-foreground shadow-glow-gold" : "h-9 w-9 border-border/0 bg-transparent",
                    !isHub && active ? "border-primary/40 bg-primary/10 text-primary" : !isHub && "text-muted-foreground",
                  )}
                >
                  <Icon className={cn(isHub ? "h-6 w-6" : "h-4 w-4")} />
                </span>
                <span className={cn("leading-none", isHub && "text-primary")}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {area !== "chat" && <AgentChat externalAgent={chatAgent} open={chatOpen} onOpenChange={setChatOpen} showTrigger={false} />}
    </main>
  );
};

export default Index;
