import { useEffect, useState } from "react";
import { TopBar } from "@/components/mission/TopBar";
import { Hero } from "@/components/mission/Hero";
import { AgentCard } from "@/components/mission/AgentCard";
import { ActiveTasksPanel } from "@/components/mission/ActiveTasksPanel";
import { SystemStatusPanel } from "@/components/mission/SystemStatusPanel";
import { OperationalTabs } from "@/components/mission/OperationalTabs";
import { CommandFooter } from "@/components/mission/CommandFooter";
import { AgentChat } from "@/components/mission/AgentChat";
import { getOpenClawState } from "@/services/api";
import type { Agent } from "@/data/mockData";

const Index = () => {
  const [tab, setTab] = useState("tasks");
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
          lastActivity: a.lastActivity ?? a.lastActivityAt ?? "—",
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
    const interval = window.setInterval(() => {
      void loadAgents();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const configuredCount = openClawState?.configuredAgents ?? agents.length;
  const onlineCount = openClawState?.onlineAgents ?? agents.length;
  const workingCount = openClawState?.workingAgents ?? openClawState?.activeAgentCount ?? 0;

  const goTab = (t: string) => {
    setTab(t);
    setTimeout(() => {
      document.getElementById("ops")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const openChat = (agentKey?: string) => {
    setChatAgent(agentKey);
    setChatOpen(true);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <TopBar onTabChange={goTab} onOpenChat={openChat} />

        <div className="space-y-5 pb-8">
          <Hero />

          <section>
            <div className="mb-3 flex items-end justify-between">
              <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Esquadrão
              </h2>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {String(onlineCount).padStart(2, "0")} / {String(configuredCount).padStart(2, "0")} online · {String(workingCount).padStart(2, "0")} working
              </span>
            </div>
            {agentError && (
              <div className="mb-3 rounded-xl border border-status-offline/30 bg-status-offline/5 px-4 py-3 text-sm text-status-offline">
                {agentError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {agents.length === 0 ? (
                <p className="col-span-full rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  Sem agentes disponíveis
                </p>
              ) : (
                agents.map((a) => (<AgentCard key={a.key} agent={a} />))
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ActiveTasksPanel onSeeAll={() => goTab("tasks")} />
            <SystemStatusPanel onSeeFail2ban={() => goTab("fail2ban")} onSeeVps={() => goTab("vps")} />
          </section>

          <div id="ops" className="scroll-mt-20">
            <OperationalTabs value={tab} onValueChange={setTab} />
          </div>

          <CommandFooter />
        </div>
      </div>
      <AgentChat externalAgent={chatAgent} open={chatOpen} onOpenChange={setChatOpen} />
    </main>
  );
};

export default Index;
