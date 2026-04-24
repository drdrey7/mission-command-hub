import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Server, Cpu, HardDrive, MemoryStick, FileText, Shield, ClipboardList, Brain, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { AuditTrail } from "./AuditTrail";
import { Fail2banPanel } from "./Fail2banPanel";
import { TasksTab } from "./TasksTab";
import { MemoryTab } from "./MemoryTab";
import { getVpsSnapshot } from "@/services/api";
import type { VpsSnapshotResponse } from "@/services/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const Bar = ({ value, tone = "accent" }: { value: number; tone?: "accent" | "warning" | "offline" }) => {
  const color = tone === "warning" ? "bg-status-warning" : tone === "offline" ? "bg-status-offline" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
};

const Metric = ({ icon: Icon, label, value, raw, tone }: { icon: typeof Cpu; label: string; value: number | null; raw: string; tone: "accent" | "warning" | "offline" }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3 w-3" /> {label}</span>
      <span className="font-mono text-foreground tabular-nums">{raw}</span>
    </div>
    <Bar value={value ?? 0} tone={tone} />
  </div>
);

interface Props {
  value: string;
  onValueChange: (v: string) => void;
}

export const OperationalTabs = ({ value, onValueChange }: Props) => {
  const [snapshot, setSnapshot] = useState<VpsSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await Promise.allSettled([getVpsSnapshot()]);
      const [vpsSnapshot] = result;
      setSnapshot(vpsSnapshot.status === "fulfilled" ? vpsSnapshot.value : null);
      setError(vpsSnapshot.status === "rejected" ? (vpsSnapshot.reason instanceof Error ? vpsSnapshot.reason.message : String(vpsSnapshot.reason)) : null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const host = snapshot?.host ?? null;
  const hasErrors = Boolean(snapshot?.errors?.length);

  return (
    <section className="panel p-4 sm:p-5">
      <Tabs value={value} onValueChange={onValueChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-surface-2/60 sm:w-auto sm:inline-flex sm:grid-cols-5">
          <TabsTrigger value="tasks" className="gap-1.5 text-xs"><ClipboardList className="h-3.5 w-3.5" />Tarefas</TabsTrigger>
          <TabsTrigger value="vps" className="gap-1.5 text-xs"><Server className="h-3.5 w-3.5" />VPS</TabsTrigger>
          <TabsTrigger value="fail2ban" className="gap-1.5 text-xs"><Shield className="h-3.5 w-3.5" />Fail2ban</TabsTrigger>
          <TabsTrigger value="memory" className="gap-1.5 text-xs"><Brain className="h-3.5 w-3.5" />Memory</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />Audit</TabsTrigger>
        </TabsList>

        {/* TASKS */}
        <TabsContent value="tasks" className="mt-5"><TasksTab /></TabsContent>

        {/* VPS */}
        <TabsContent value="vps" className="mt-5">
          {loading && !snapshot ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar snapshot real…
            </div>
          ) : error && !snapshot ? (
            <div className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-sm text-status-warning">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>{error}</div>
              </div>
            </div>
          ) : !snapshot ? (
            <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              Sem snapshot VPS disponível
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    VPS · {host?.hostname ?? "—"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {host?.uptime ? `Uptime ${host.uptime}` : "sem uptime disponível"}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Actualizar
                </Button>
              </div>

              {hasErrors && (
                <div className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-sm text-status-warning">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>{snapshot?.errors?.[0] ?? "Snapshot VPS com aviso"} </div>
                  </div>
                </div>
              )}

              {error && !hasErrors && (
                <div className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-sm text-status-warning">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>{error}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-xl border border-border/60 bg-surface-2/50 p-4">
                  <div className="grid grid-cols-1 gap-3">
                    <Metric
                      icon={Cpu}
                      label="CPU"
                      value={host?.cpuPercent ?? null}
                      raw={host?.cpuPercent === null ? "—" : `${host.cpuPercent.toFixed(1)}%`}
                      tone={(host?.cpuPercent ?? 0) > 85 ? "offline" : (host?.cpuPercent ?? 0) > 65 ? "warning" : "accent"}
                    />
                    <Metric
                      icon={MemoryStick}
                      label="RAM"
                      value={host?.ramPercent ?? null}
                      raw={host?.ramUsed && host?.ramTotal ? `${host.ramUsed}/${host.ramTotal}` : "—"}
                      tone={(host?.ramPercent ?? 0) > 85 ? "offline" : (host?.ramPercent ?? 0) > 65 ? "warning" : "accent"}
                    />
                    <Metric
                      icon={HardDrive}
                      label="Disco"
                      value={host?.diskUsedPercent ?? null}
                      raw={host?.diskUsedPercent === null ? "—" : `${host.diskUsedPercent.toFixed(1)}%`}
                      tone={(host?.diskUsedPercent ?? 0) > 85 ? "offline" : (host?.diskUsedPercent ?? 0) > 65 ? "warning" : "accent"}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-surface-2/50 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Containers</h3>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {snapshot?.docker?.healthy ?? 0}/{snapshot?.docker?.total ?? 0} healthy
                    </span>
                  </div>
                  {snapshot.containers.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                      Sem containers detectados
                    </div>
                  ) : (
                    <div className="mt-3 space-y-1.5">
                      {snapshot.containers.map((container) => (
                        <div key={container.name} className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-surface-1/40 px-2 py-1.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              container.healthy ? "bg-status-online" : "bg-status-warning"
                            )} />
                            <span className="truncate font-mono text-xs text-foreground">{container.name}</span>
                          </div>
                          <span className={cn(
                            "shrink-0 font-mono text-[10px]",
                            container.healthy ? "text-status-online" : "text-status-warning"
                          )}>{container.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* FAIL2BAN */}
        <TabsContent value="fail2ban" className="mt-5"><Fail2banPanel /></TabsContent>

        {/* MEMORY */}
        <TabsContent value="memory" className="mt-5"><MemoryTab /></TabsContent>

        {/* AUDIT */}
        <TabsContent value="audit" className="mt-5"><AuditTrail /></TabsContent>
      </Tabs>
    </section>
  );
};
