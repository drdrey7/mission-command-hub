import { Hero } from "@/components/mission/Hero";
import { AgentCard } from "@/components/mission/AgentCard";
import { ActiveTasksPanel } from "@/components/mission/ActiveTasksPanel";
import { SystemStatusPanel } from "@/components/mission/SystemStatusPanel";
import { RecentActivityPanel } from "@/components/mission/RecentActivityPanel";
import { CommandFooter } from "@/components/mission/CommandFooter";
import { agents } from "@/data/mockData";

const Index = () => {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Hero />

        {/* Agents */}
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Agentes Operacionais
              </h2>
              <p className="mt-1 font-display text-2xl font-bold text-foreground">
                Esquadrão em formação
              </p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">04 / 04 ativos</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {agents.map((a) => (
              <AgentCard key={a.key} agent={a} />
            ))}
          </div>
        </section>

        {/* Operational panels */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ActiveTasksPanel />
          <SystemStatusPanel />
          <RecentActivityPanel />
        </section>

        <CommandFooter />
      </div>
    </main>
  );
};

export default Index;
