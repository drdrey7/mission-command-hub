import { useEffect, useState } from "react";
import { Shield, ShieldOff, RefreshCw, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVpsNodes } from "@/services/api";
import type { VpsNode } from "@/data/mockData";
import { cn } from "@/lib/utils";

const Stat = ({ label, value, sub, tone = "default", icon: Icon }: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "danger" | "ok";
  icon?: typeof Shield;
}) => {
  const toneCls = tone === "danger" ? "text-status-offline" : tone === "ok" ? "text-status-online" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-surface-2/50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        {Icon && <Icon className={cn("h-3.5 w-3.5", toneCls)} />}
      </div>
      <p className={cn("mt-1.5 font-mono text-2xl font-bold tabular-nums", toneCls)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
};

export const Fail2banPanel = () => {
  const [node, setNode] = useState<VpsNode | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const nodes = await getVpsNodes();
    setNode(nodes[0] ?? null);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const banned = node?.banned ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-agent-cyber" />
          Fail2ban · monitor em tempo real
          <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-status-online/40 bg-status-online/10 px-2 py-0.5 text-[10px] font-bold text-status-online">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-online" /> LIVE
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Banidos agora"
          value={node === null ? "—" : banned}
          icon={banned > 0 ? ShieldOff : Shield}
          tone={banned > 0 ? "danger" : "ok"}
          sub="IPs activos no jail"
        />
        <Stat
          label="VPS"
          value={node?.name ?? "—"}
          icon={Shield}
          sub={node?.uptime ?? "—"}
        />
        <Stat
          label="Estado"
          value={node?.status ?? "—"}
          icon={Shield}
          tone={node?.status === "online" ? "ok" : "danger"}
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-surface-2/30 p-8 text-center">
        {banned === 0 ? (
          <>
            <Shield className="mx-auto h-10 w-10 text-status-online" />
            <p className="mt-3 font-display text-base font-bold text-foreground">Nenhum IP banido actualmente</p>
            <p className="mt-1 text-sm text-muted-foreground">
              O monitor está activo. Esta lista actualiza automaticamente a cada 30 segundos.
            </p>
          </>
        ) : (
          <>
            <ShieldOff className="mx-auto h-10 w-10 text-status-offline" />
            <p className="mt-3 font-display text-base font-bold text-foreground">{banned} IPs banidos</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              Lista detalhada disponível via API quando o endpoint /api/fail2ban/banned for ativado.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
