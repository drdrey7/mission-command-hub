import { useEffect, useState } from "react";
import { Shield, ShieldOff, RefreshCw, Loader2, AlertTriangle, CircleSlash2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFail2banBanned, getFail2banHistory, getFail2banJails, getFail2banStats } from "@/services/api";
import type {
  Fail2banBannedResponse,
  Fail2banHistoryEntry,
  Fail2banHistoryResponse,
  Fail2banJail,
  Fail2banJailsResponse,
  Fail2banStats,
} from "@/services/api";
import { cn } from "@/lib/utils";

const Stat = ({
  label,
  value,
  sub,
  tone = "default",
  icon: Icon,
}: {
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

const formatTime = (value: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
};

const joinJails = (jails: string[]): string => (jails.length > 0 ? jails.join(", ") : "—");

export const Fail2banPanel = () => {
  const [stats, setStats] = useState<Fail2banStats | null>(null);
  const [jailsResponse, setJailsResponse] = useState<Fail2banJailsResponse | null>(null);
  const [bannedResponse, setBannedResponse] = useState<Fail2banBannedResponse | null>(null);
  const [historyResponse, setHistoryResponse] = useState<Fail2banHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [statsResult, jailsResult, bannedResult, historyResult] = await Promise.allSettled([
        getFail2banStats(),
        getFail2banJails(),
        getFail2banBanned(),
        getFail2banHistory(),
      ]);
      setStats(statsResult.status === "fulfilled" ? statsResult.value : null);
      setJailsResponse(jailsResult.status === "fulfilled" ? jailsResult.value : null);
      setBannedResponse(bannedResult.status === "fulfilled" ? bannedResult.value : null);
      setHistoryResponse(historyResult.status === "fulfilled" ? historyResult.value : null);

      const messages = [
        statsResult.status === "rejected" ? (statsResult.reason instanceof Error ? statsResult.reason.message : String(statsResult.reason)) : null,
        jailsResult.status === "rejected" ? (jailsResult.reason instanceof Error ? jailsResult.reason.message : String(jailsResult.reason)) : null,
        bannedResult.status === "rejected" ? (bannedResult.reason instanceof Error ? bannedResult.reason.message : String(bannedResult.reason)) : null,
        historyResult.status === "rejected" ? (historyResult.reason instanceof Error ? historyResult.reason.message : String(historyResult.reason)) : null,
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
  const currentBannedList = bannedResponse?.bannedList ?? [];
  const currentBannedCount =
    bannedResponse?.currentBannedCount ??
    bannedResponse?.bannedCount ??
    (currentBannedList.length > 0 ? currentBannedList.length : null) ??
    stats?.currentBannedCount ??
    stats?.bannedCount ??
    stats?.totalBanned ??
    null;
  const jailsActive = stats?.jailsActive ?? jailsResponse?.jailsActive ?? (jails.length > 0 ? jails.length : null);
  const history = historyResponse?.history ?? [];
  const historyCount = historyResponse?.totalUniqueIps ?? history.length;

  const warningText =
    stats?.errors?.[0] ||
    jailsResponse?.errors?.[0] ||
    bannedResponse?.errors?.[0] ||
    historyResponse?.errors?.[0] ||
    stats?.warnings?.[0] ||
    jailsResponse?.warnings?.[0] ||
    bannedResponse?.warnings?.[0] ||
    historyResponse?.warnings?.[0] ||
    null;

  const historyNote = historyResponse?.retentionLimited
    ? `Histórico coberto pelos logs locais disponíveis${historyResponse.firstSeenAt ? ` desde ${formatTime(historyResponse.firstSeenAt)}` : ""}. Pode ficar limitado pela rotação.`
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-agent-cyber" />
          Fail2ban · monitor real
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

      {historyNote && (
        <div className="rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3 text-xs text-muted-foreground">
          {historyNote}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Banidos agora"
          value={loading || currentBannedCount === null ? "—" : currentBannedCount}
          icon={(currentBannedCount ?? 0) > 0 ? ShieldOff : Shield}
          tone={(currentBannedCount ?? 0) > 0 ? "danger" : "ok"}
          sub="IPs actualmente banidos"
        />
        <Stat
          label="Jails activos"
          value={loading || jailsActive === null ? "—" : jailsActive}
          icon={Shield}
          sub={jails.length > 0 ? "jails reais detectadas" : emptyText}
        />
        <Stat
          label="Histórico único"
          value={loading ? "—" : historyCount}
          icon={History}
          tone={(historyCount ?? 0) > 0 ? "danger" : "ok"}
          sub="IPs vistos nos logs locais"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-surface-2/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Jails</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Contagem actual por jail a partir de `fail2ban-client status`.</p>
            </div>
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
                        {jail.enabled ? "activo" : "inactivo"} · {jail.bannedList.length} IPs em estado actual
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
            <div>
              <h3 className="text-sm font-semibold text-foreground">IPs actualmente banidos</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Mesmo contrato que alimenta os contadores reais.</p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{currentBannedList.length}</span>
          </div>
          {currentBannedList.length === 0 ? (
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
              {currentBannedList.map((entry) => (
                <div
                  key={`${entry.jail}:${entry.ip}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface-1/50 px-3 py-2"
                >
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

      <div className="rounded-xl border border-border/60 bg-surface-2/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Histórico de IPs banidos</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {historyResponse?.firstSeenAt
                ? `Cobertura desde ${formatTime(historyResponse.firstSeenAt)}`
                : "Cobertura limitada pelos logs locais disponíveis"}
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{history.length}</span>
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 px-4 py-8 text-center">
            <History className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">
              {historyResponse?.errors?.length ? "Falha a carregar histórico real." : "Sem histórico disponível"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {historyResponse?.errors?.length
                ? "Verifica o acesso aos logs do Fail2ban."
                : "Só são mostrados os IPs encontrados nos logs locais retidos."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/60">
            <div className="hidden grid-cols-[1.2fr_1.4fr_0.8fr_0.8fr] gap-3 border-b border-border/60 bg-surface-1/60 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
              <span>IP</span>
              <span>Jails / estado</span>
              <span>Primeiro visto</span>
              <span>Último visto</span>
            </div>
            <div className="divide-y divide-border/60">
              {history.map((entry: Fail2banHistoryEntry) => (
                <div
                  key={entry.ip}
                  className="grid grid-cols-1 gap-2 px-3 py-3 md:grid-cols-[1.2fr_1.4fr_0.8fr_0.8fr] md:items-center md:gap-3"
                >
                  <div className="flex items-center justify-between gap-2 md:block">
                    <p className="font-mono text-sm font-semibold text-foreground">{entry.ip}</p>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider md:hidden",
                        entry.currentlyBanned
                          ? "border-status-offline/40 bg-status-offline/10 text-status-offline"
                          : "border-status-online/40 bg-status-online/10 text-status-online"
                      )}
                    >
                      {entry.currentlyBanned ? "actual" : "libertado"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p className="text-foreground">{joinJails(entry.jails)}</p>
                    <p className="mt-0.5">
                      {entry.banCount} ban{entry.banCount === 1 ? "" : "s"} · {entry.currentlyBanned ? "ainda banido" : "já libertado"}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p className="font-mono text-foreground">{formatTime(entry.firstSeenAt)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground md:block">
                    <p className="font-mono text-foreground">{formatTime(entry.lastSeenAt)}</p>
                    <span
                      className={cn(
                        "hidden rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider md:inline-flex",
                        entry.currentlyBanned
                          ? "border-status-offline/40 bg-status-offline/10 text-status-offline"
                          : "border-status-online/40 bg-status-online/10 text-status-online"
                      )}
                    >
                      {entry.currentlyBanned ? "actual" : "libertado"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
