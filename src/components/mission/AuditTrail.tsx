import { useEffect, useState } from "react";
import { getAuditTrail } from "@/services/api";
import { ActivityEvent, AgentKey } from "@/data/mockData";
import { AgentBadge } from "./AgentBadge";
import { Server, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const AuditTrail = () => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  useEffect(() => { getAuditTrail(100).then(setEvents); }, []);

  const exportCsv = () => {
    const rows = [["id", "time", "agent", "text"], ...events.map((e) => [e.id, e.time, e.agent, e.text])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `openclaw-audit-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit trail exportado");
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <FileText className="h-3.5 w-3.5" /> Linha temporal forense · {events.length} eventos
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} className="gap-2">
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </Button>
      </div>

      <ol className="relative space-y-2 border-l border-border/60 pl-5">
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[26px] top-2 flex h-3 w-3 items-center justify-center">
              <span className="h-2 w-2 rounded-full bg-accent" />
            </span>
            <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-surface-2/40 p-3">
              {e.agent === "sistema" ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-3">
                  <Server className="h-4 w-4 text-muted-foreground" />
                </div>
              ) : (
                <AgentBadge agent={e.agent as AgentKey} size="sm" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{e.text}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {e.agent} · {e.time}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};
