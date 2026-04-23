import { useEffect, useState } from "react";
import { TopBar } from "@/components/mission/TopBar";
import { Hero } from "@/components/mission/Hero";
import { AgentCard } from "@/components/mission/AgentCard";
import { ActiveTasksPanel } from "@/components/mission/ActiveTasksPanel";
import { SystemStatusPanel } from "@/components/mission/SystemStatusPanel";
import { OperationalTabs } from "@/components/mission/OperationalTabs";
import { CommandFooter } from "@/components/mission/CommandFooter";
import { AgentChat } from "@/components/mission/AgentChat";
import { getAgents } from "@/services/api";
import type { Agent } from "@/data/mockData";

const Index = () => {
  const [tab, setTab] = useState("tasks");
  const [chatAgent, setChatAgent] = useState<string | undefined>();
  const [chatOpen, setChatOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => { getAgents().then(setAgents); }, []);

  const activeCount = agents.filter((a) => a.status === "em_voo" || a.status === "taxiing").length;

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
                {String(activeCount).padStart(2, "0")} / {String(agents.length).padStart(2, "0")} ativos
              </span>
            </div>
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
