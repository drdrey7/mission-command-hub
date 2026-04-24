import { useEffect, useState } from "react";
import { Shield, ShieldOff, RefreshCw, Loader2, AlertTriangle, CircleSlash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFail2banBanned, getFail2banJails, getFail2banStats } from "@/services/api";
import type { BannedIp, Fail2banBannedResponse, Fail2banJail, Fail2banJailsResponse, Fail2banStats } from "@/services/api";
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

const emptyText = "Sem dados reais do Fail2ban.";

export const Fail2banPanel = () => {
  const [stats, setStats] = useState<Fail2banStats | null>(null);
  const [jailsResponse, setJailsResponse] = useState<Fail2banJailsResponse | null>(null);
  const [bannedResponse, setBannedResponse] = useState<Fail2banBannedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [statsResult, jailsResult, bannedResult] = await Promise.allSettled([
        getFail2banStats(),
        getFail2banJails(),
        getFail2banBanned(),
      ]);
      setStats(statsResult.status === "fulfilled" ? statsResult.value : null);
      setJailsResponse(jailsResult.status === "fulfilled" ? jailsResult.value : null);
      setBannedResponse(bannedResult.status === "fulfilled" ? bannedResult.value : null);
      const messages = [
        statsResult.status === "rejected" ? (statsResult.reason instanceof Error ? statsResult.reason.message : String(statsResult.reason)) : null,
        jailsResult.status === "rejected" ? (jailsResult.reason instanceof Error ? jailsResult.reason.message : String(jailsResult.reason)) : null,
        bannedResult.status === "rejected" ? (bannedResult.reason instanceof Error ? bannedResult.reason.message : String(bannedResult.reason)) : null,
      ].filter(Boolean);
      setError(messages.length > 0 ? messages.join(" · ") : null);
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

  const jails = jailsResponse?.jails ?? [];
  const banned = bannedResponse?.bannedList ?? [];
  const bannedCount = stats?.bannedCount ?? (bannedResponse ? banned.length : null);
  const totalBanned = stats?.totalBanned ?? (bannedResponse ? banned.length : null);
  const jailsActive = stats?.jailsActive ?? (jailsResponse ? jails.length : null);
  const warningText = stats?.errors?.[0] || jailsResponse?.errors?.[0] || bannedResponse?.errors?.[0] || stats?.warnings?.[0] || jailsResponse?.warnings?.[0] || bannedResponse?.warnings?.[0] || null;

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
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      {warningText && (
        <div className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-sm text-status-warning">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{warningText}</div>
          </div>
        </div>
      )}

      {error && !warningText && (
        <div className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-sm text-status-warning">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{error}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Banidos agora"
          value={loading || bannedCount === null ? "—" : bannedCount}
          icon={(bannedCount ?? 0) > 0 ? ShieldOff : Shield}
          tone={(bannedCount ?? 0) > 0 ? "danger" : "ok"}
          sub="IPs actualmente banidos"
        />
        <Stat
          label="Jails activos"
          value={loading || jailsActive === null ? "—" : jailsActive}
          icon={Shield}
          sub={jails.length > 0 ? "jails reais detectadas" : emptyText}
        />
        <Stat
          label="Total registado"
          value={loading || totalBanned === null ? "—" : totalBanned}
          icon={Shield}
          tone={(totalBanned ?? 0) > 0 ? "danger" : "ok"}
          sub="soma dos bans actuais por jail"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-surface-2/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Jails</h3>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{jails.length}</span>
          </div>
          {jails.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 px-4 py-8 text-center">
              <CircleSlash2 className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">
                {error && !warningText ? "Falha a carregar jails reais." : emptyText}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {error && !warningText
                  ? "Verifica permissões do fail2ban-client ou o estado do serviço."
                  : "O backend devolve estado explícito quando o Fail2ban não está disponível."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {jails.map((jail) => (
                <div key={jail.name} className="rounded-lg border border-border/60 bg-surface-1/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-foreground">{jail.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {jail.enabled ? "activo" : "inactivo"} · {jail.bannedList.length} IPs listados
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        (jail.currentlyBanned ?? 0) > 0
                          ? "border-status-offline/40 bg-status-offline/10 text-status-offline"
                          : "border-status-online/40 bg-status-online/10 text-status-online"
                      )}
                    >
                      {jail.currentlyBanned ?? "—"} banidos
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-surface-2/40 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Falhados</p>
                      <p className="mt-0.5 font-mono text-foreground">{jail.currentlyFailed ?? "—"}</p>
                    </div>
                    <div className="rounded-md bg-surface-2/40 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                      <p className="mt-0.5 font-mono text-foreground">{jail.totalBanned ?? "—"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-surface-2/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">IPs banidos</h3>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{banned.length}</span>
          </div>
          {banned.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 px-4 py-8 text-center">
              <Shield className="h-8 w-8 text-status-online" />
              <p className="mt-3 text-sm font-medium text-foreground">
                {(stats?.errors?.length || bannedResponse?.errors?.length || error)
                  ? "Falha a carregar IPs banidos reais."
                  : "Nenhum IP banido actualmente"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {(stats?.errors?.length || bannedResponse?.errors?.length || error)
                  ? "Verifica o backend ou permissões do fail2ban-client."
                  : "A lista actualiza automaticamente a cada 30 segundos."}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {banned.map((entry) => (
                <div key={`${entry.jail}:${entry.ip}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface-1/50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-foreground">{entry.ip}</p>
                    <p className="text-[11px] text-muted-foreground">{entry.jail}</p>
                  </div>
                  <ShieldOff className="h-4 w-4 shrink-0 text-status-offline" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
