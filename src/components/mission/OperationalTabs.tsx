import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Server, Cpu, HardDrive, MemoryStick, FileText, Shield, ClipboardList } from "lucide-react";
import type { VpsNode } from "@/data/mockData";
import { AuditTrail } from "./AuditTrail";
import { VpsActions } from "./VpsActions";
import { Fail2banPanel } from "./Fail2banPanel";
import { TasksTab } from "./TasksTab";
import { getVpsNodes } from "@/services/api";
import { cn } from "@/lib/utils";

const Bar = ({ value, tone = "accent" }: { value: number; tone?: "accent" | "warning" | "offline" }) => {
  const color = tone === "warning" ? "bg-status-warning" : tone === "offline" ? "bg-status-offline" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
};

interface Props {
  value: string;
  onValueChange: (v: string) => void;
}

export const OperationalTabs = ({ value, onValueChange }: Props) => {
  const [nodes, setNodes] = useState<VpsNode[] | null>(null);

  useEffect(() => { getVpsNodes().then(setNodes); }, []);

  return (
    <section className="panel p-4 sm:p-5">
      <Tabs value={value} onValueChange={onValueChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-surface-2/60 sm:w-auto sm:inline-flex sm:grid-cols-4">
          <TabsTrigger value="tasks" className="gap-1.5 text-xs"><ClipboardList className="h-3.5 w-3.5" />Tarefas</TabsTrigger>
          <TabsTrigger value="vps" className="gap-1.5 text-xs"><Server className="h-3.5 w-3.5" />VPS</TabsTrigger>
          <TabsTrigger value="fail2ban" className="gap-1.5 text-xs"><Shield className="h-3.5 w-3.5" />Fail2ban</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />Audit</TabsTrigger>
        </TabsList>

        {/* TASKS */}
        <TabsContent value="tasks" className="mt-5"><TasksTab /></TabsContent>

        {/* VPS */}
        <TabsContent value="vps" className="mt-5">
          {nodes === null ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : nodes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              Sem dados VPS disponíveis
            </div>
          ) : (
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
                      <Metric icon={Cpu} label="CPU" value={n.cpu} raw={`${n.cpu.toFixed(1)}%`} tone={tone} />
                      <Metric icon={MemoryStick} label="RAM" value={n.ram} raw={n.ramRaw} tone={tone} />
                      <Metric icon={HardDrive} label="Disco" value={n.disk} raw={`${n.disk}%`} tone={tone} />
                    </div>

                    {n.containers.length > 0 && (
                      <div className="mt-4 border-t border-border/60 pt-3">
                        <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Containers</p>
                        <div className="space-y-1.5">
                          {n.containers.map((c) => (
                            <div key={c.name} className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-surface-1/40 px-2 py-1.5">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className={cn(
                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                  c.healthy ? "bg-status-online" : "bg-status-warning"
                                )} />
                                <span className="truncate font-mono text-xs text-foreground">{c.name}</span>
                              </div>
                              <span className={cn(
                                "shrink-0 font-mono text-[10px]",
                                c.healthy ? "text-status-online" : "text-status-warning"
                              )}>{c.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                      <span className="text-muted-foreground">Uptime</span>
                      <span className="font-mono text-foreground tabular-nums">{n.uptime}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* FAIL2BAN */}
        <TabsContent value="fail2ban" className="mt-5"><Fail2banPanel /></TabsContent>

        {/* AUDIT */}
        <TabsContent value="audit" className="mt-5"><AuditTrail /></TabsContent>
      </Tabs>
    </section>
  );
};

const Metric = ({ icon: Icon, label, value, raw, tone }: { icon: typeof Cpu; label: string; value: number; raw: string; tone: "accent" | "warning" | "offline" }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3 w-3" /> {label}</span>
      <span className="font-mono text-foreground tabular-nums">{raw}</span>
    </div>
    <Bar value={value} tone={tone} />
  </div>
);
