import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Server, Target, Cpu, HardDrive, MemoryStick, Plane, Trophy, FileText, Shield, ClipboardList } from "lucide-react";
import { memoryEntries, AgentKey, Mission, VpsNode } from "@/data/mockData";
import { AgentBadge } from "./AgentBadge";
import { MissionBuilder } from "./MissionBuilder";
import { AuditTrail } from "./AuditTrail";
import { VpsActions } from "./VpsActions";
import { Fail2banPanel } from "./Fail2banPanel";
import { TasksTab } from "./TasksTab";
import { getMissions, getVpsNodes } from "@/services/api";
import { cn } from "@/lib/utils";

const agentColor: Record<AgentKey, string> = {
  comandante: "text-agent-comandante", cyber: "text-agent-cyber",
  flow: "text-agent-flow", ledger: "text-agent-ledger",
};

const missionStatus: Record<string, { label: string; cls: string }> = {
  em_voo: { label: "Em voo", cls: "bg-agent-cyber/15 text-agent-cyber border-agent-cyber/40" },
  preparando: { label: "Preparando", cls: "bg-status-warning/15 text-status-warning border-status-warning/40" },
  concluido: { label: "Concluído", cls: "bg-status-online/15 text-status-online border-status-online/40" },
  abortado: { label: "Abortado", cls: "bg-status-offline/15 text-status-offline border-status-offline/40" },
};

const Bar = ({ value, tone = "accent" }: { value: number; tone?: "accent" | "warning" | "offline" }) => {
  const color = tone === "warning" ? "bg-status-warning" : tone === "offline" ? "bg-status-offline" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
    </div>
  );
};

interface Props {
  value: string;
  onValueChange: (v: string) => void;
}

export const OperationalTabs = ({ value, onValueChange }: Props) => {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [nodes, setNodes] = useState<VpsNode[]>([]);

  useEffect(() => {
    getMissions().then(setMissions);
    getVpsNodes().then(setNodes);
  }, []);

  return (
    <section className="panel p-4 sm:p-5">
      <Tabs value={value} onValueChange={onValueChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-surface-2/60 sm:w-auto sm:inline-flex sm:grid-cols-6">
          <TabsTrigger value="missions" className="gap-1.5 text-xs"><Target className="h-3.5 w-3.5" />Missões</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5 text-xs"><ClipboardList className="h-3.5 w-3.5" />Tarefas</TabsTrigger>
          <TabsTrigger value="vps" className="gap-1.5 text-xs"><Server className="h-3.5 w-3.5" />VPS</TabsTrigger>
          <TabsTrigger value="fail2ban" className="gap-1.5 text-xs"><Shield className="h-3.5 w-3.5" />Fail2ban</TabsTrigger>
          <TabsTrigger value="memory" className="gap-1.5 text-xs"><Brain className="h-3.5 w-3.5" />Memória</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />Audit</TabsTrigger>
        </TabsList>

        {/* MISSIONS */}
        <TabsContent value="missions" className="mt-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{missions.length} missões registadas</p>
            <MissionBuilder onCreated={(m) => setMissions((prev) => [m, ...prev])} />
          </div>
          <div className="space-y-3">
            {missions.map((m) => {
              const st = missionStatus[m.status];
              return (
                <div key={m.id} className="rounded-xl border border-border/60 bg-surface-2/50 p-4 transition-smooth hover:border-border">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <AgentBadge agent={m.lead} working={m.status === "em_voo"} size="md" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{m.id}</span>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", st.cls)}>{st.label}</span>
                        </div>
                        <h3 className="mt-1 font-display text-lg font-bold text-foreground">{m.codename}</h3>
                        <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">{m.objective}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">ETA</p>
                      <p className="font-mono text-sm font-bold text-foreground tabular-nums">{m.eta}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {m.squad.map((a) => (
                        <div key={a} className="rounded-full ring-2 ring-background" title={a}>
                          <AgentBadge agent={a} size="sm" />
                        </div>
                      ))}
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          {m.status === "concluido" ? <Trophy className="h-3 w-3 text-status-online" /> : <Plane className="h-3 w-3" />}
                          progresso
                        </span>
                        <span className="font-mono text-foreground tabular-nums">{m.progress}%</span>
                      </div>
                      <Bar value={m.progress} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* TASKS */}
        <TabsContent value="tasks" className="mt-5"><TasksTab /></TabsContent>

        {/* VPS */}
        <TabsContent value="vps" className="mt-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {nodes.map((n) => {
              const tone = n.status === "warning" ? "warning" : n.status === "offline" ? "offline" : "accent";
              return (
                <div key={n.id} className="rounded-xl border border-border/60 bg-surface-2/50 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-sm font-bold text-foreground">{n.name}</p>
                      <p className="text-xs text-muted-foreground">{n.region}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        n.status === "online" && "border-status-online/40 bg-status-online/10 text-status-online",
                        n.status === "warning" && "border-status-warning/40 bg-status-warning/10 text-status-warning",
                        n.status === "offline" && "border-status-offline/40 bg-status-offline/10 text-status-offline"
                      )}>{n.status}</span>
                      <VpsActions nodeId={n.id} nodeName={n.name} />
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <Metric icon={Cpu} label="CPU" value={n.cpu} tone={tone} />
                    <Metric icon={MemoryStick} label="RAM" value={n.ram} tone={tone} />
                    <Metric icon={HardDrive} label="Disco" value={n.disk} tone={tone} />
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                    <span className="text-muted-foreground">Uptime</span>
                    <span className="font-mono text-foreground tabular-nums">{n.uptime}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* FAIL2BAN */}
        <TabsContent value="fail2ban" className="mt-5"><Fail2banPanel /></TabsContent>

        {/* MEMORY */}
        <TabsContent value="memory" className="mt-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {memoryEntries.map((m) => (
              <div key={m.id} className="flex items-start gap-3 rounded-xl border border-border/50 bg-surface-2/40 p-4 transition-smooth hover:border-border">
                <AgentBadge agent={m.agent} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("font-mono text-xs uppercase tracking-wider", agentColor[m.agent])}>{m.agent} · {m.key}</p>
                    <span className="font-mono text-[10px] text-muted-foreground">{m.updated}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{m.value}</p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* AUDIT */}
        <TabsContent value="audit" className="mt-5"><AuditTrail /></TabsContent>
      </Tabs>
    </section>
  );
};

const Metric = ({ icon: Icon, label, value, tone }: { icon: typeof Cpu; label: string; value: number; tone: "accent" | "warning" | "offline" }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3 w-3" /> {label}</span>
      <span className="font-mono text-foreground tabular-nums">{value}%</span>
    </div>
    <Bar value={value} tone={tone} />
  </div>
);
