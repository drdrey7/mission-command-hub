import { useEffect, useState } from "react";
import { getAuditTrail } from "@/services/api";
import type { ActivityEvent } from "@/data/mockData";
import { Server, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const AuditTrail = () => {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  useEffect(() => { getAuditTrail(200).then(setEvents); }, []);

  const exportCsv = () => {
    if (!events) return;
    const rows = [["id", "time", "source", "text"], ...events.map((e) => [e.id, e.time, e.source, e.text])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `openclaw-audit-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit trail exportado");
  };

  const list = events ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Linha temporal · {events === null ? "a carregar…" : `${list.length} eventos`}
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={list.length === 0} className="gap-2">
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </Button>
      </div>

      {events !== null && list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Sem actividade registada
        </div>
      ) : (
        <ol className="relative space-y-2 border-l border-border/60 pl-5">
          {list.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[26px] top-2 flex h-3 w-3 items-center justify-center">
                <span className="h-2 w-2 rounded-full bg-accent" />
              </span>
              <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-surface-2/40 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-3">
                  <Server className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{e.text}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {e.source} · {e.time}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
