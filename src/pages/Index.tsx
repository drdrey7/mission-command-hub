import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Brain,
  ClipboardList,
  FileText,
  Home,
  LayoutGrid,
  MessageSquare,
  Plane,
  Server,
  Shield,
} from "lucide-react";
import { TopBar } from "@/components/mission/TopBar";
import { AgentCard } from "@/components/mission/AgentCard";
import { ActiveTasksPanel } from "@/components/mission/ActiveTasksPanel";
import { SystemStatusPanel } from "@/components/mission/SystemStatusPanel";
import { CommandFooter } from "@/components/mission/CommandFooter";
import { AgentChat } from "@/components/mission/AgentChat";
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
  { key: "chat", label: "Chat", icon: MessageSquare },
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
  if (area === "home") return { title: "Home", subtitle: "Cockpit curto: agentes, alertas e sinais importantes." };
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
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface-2">
            <Bell className="h-4 w-4 text-status-warning" />
          </div>
          <div>
            <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-foreground">Atencao</h2>
            <p className="text-[11px] text-muted-foreground">{loading ? "a carregar..." : `${notifications.length} sinais importantes`}</p>
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
        <div className="mt-4 rounded-xl border border-border/60 bg-surface-2/30 px-3 py-3 text-sm text-muted-foreground">
          Sem alertas criticos por ler.
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

  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-foreground">Agentes</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {String(onlineCount).padStart(2, "0")} / {String(configuredCount).padStart(2, "0")} online · {String(workingCount).padStart(2, "0")} working
          </p>
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {compactAgents.length === 0 ? (
          <p className="col-span-full rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Sem agentes disponiveis
          </p>
        ) : (
          compactAgents.map((agent) => <AgentCard key={agent.key} agent={agent} />)
        )}
      </div>
    </section>
  );
};

const HubLauncher = ({ onOpenModule }: { onOpenModule: (module: ModuleArea) => void }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
    {HUB_MODULES.map((module) => {
      const Icon = module.icon;
      return (
        <button
          key={module.key}
          type="button"
          onClick={() => onOpenModule(module.key)}
          className="group overflow-hidden rounded-2xl border border-border/60 bg-surface-1/70 p-5 text-left shadow-panel transition-smooth hover:-translate-y-0.5 hover:border-primary/60 hover:bg-surface-2/70"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">{module.eyebrow}</p>
              <h3 className="mt-2 font-display text-lg font-semibold text-foreground">{module.label}</h3>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-glow-gold transition-smooth group-hover:scale-105">
              <Icon className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">{module.description}</p>
        </button>
      );
    })}
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
        <div className="space-y-4">
          <AgentsSummary agents={agents} configuredCount={configuredCount} onlineCount={onlineCount} workingCount={workingCount} error={agentError} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AttentionPanel />
            <ActiveTasksPanel onSeeAll={() => goArea("tasks")} />
          </div>
          <SystemStatusPanel onSeeFail2ban={() => goArea("fail2ban")} onSeeVps={() => goArea("vps")} />
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
        <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
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
                  "relative flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-semibold transition-smooth",
                  active ? "text-foreground" : "text-muted-foreground",
                  isHub && "-mt-5",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-2xl border transition-smooth",
                    isHub ? "h-14 w-14 border-primary/60 bg-primary text-primary-foreground shadow-glow-gold" : "h-9 w-9",
                    !isHub && active ? "border-primary/40 bg-primary/10" : !isHub && "border-transparent bg-transparent",
                  )}
                >
                  <Icon className={cn(isHub ? "h-6 w-6" : "h-4 w-4")} />
                </span>
                <span className={cn(isHub && "text-primary")}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {area !== "chat" && <AgentChat externalAgent={chatAgent} open={chatOpen} onOpenChange={setChatOpen} />}
    </main>
  );
};

export default Index;
