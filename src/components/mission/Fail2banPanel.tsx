import { useEffect, useMemo, useState } from "react";
import { Shield, ShieldOff, Search, Filter, RefreshCw, Globe, AlertTriangle, Activity, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getFail2banBanned,
  getFail2banJails,
  getFail2banStats,
  unbanIp,
  BannedIp,
  Fail2banJail,
  Fail2banStats,
} from "@/services/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const flag = (code?: string) => {
  if (!code || code.length !== 2) return "🌐";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
};

const fmtRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(Math.abs(diff) / 60000);
  if (mins < 1) return diff >= 0 ? "agora" : "em instantes";
  if (mins < 60) return diff >= 0 ? `há ${mins} min` : `em ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return diff >= 0 ? `há ${hours}h` : `em ${hours}h`;
  return diff >= 0 ? `há ${Math.floor(hours / 24)}d` : `em ${Math.floor(hours / 24)}d`;
};

const Stat = ({ label, value, sub, tone = "default", icon: Icon }: {
  label: string; value: string | number; sub?: string;
  tone?: "default" | "warning" | "danger" | "ok";
  icon?: typeof Shield;
}) => {
  const toneCls = tone === "danger" ? "text-status-offline" : tone === "warning" ? "text-status-warning" : tone === "ok" ? "text-status-online" : "text-foreground";
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

const Sparkbars = ({ data }: { data: { hour: string; attempts: number; bans: number }[] }) => {
  const max = Math.max(...data.map((d) => d.attempts), 1);
  return (
    <div className="flex h-20 items-end gap-[3px]">
      {data.map((d) => {
        const h = (d.attempts / max) * 100;
        const banH = d.bans > 0 ? Math.max(8, (d.bans / Math.max(...data.map((x) => x.bans), 1)) * 100) : 0;
        return (
          <div key={d.hour} className="group relative flex-1" title={`${d.hour} · ${d.attempts} tent. · ${d.bans} bans`}>
            <div className="flex h-full flex-col justify-end">
              <div className="w-full rounded-t-sm bg-status-warning/30 transition-smooth group-hover:bg-status-warning/50" style={{ height: `${h}%` }} />
              {d.bans > 0 && (
                <div className="absolute bottom-0 w-full rounded-t-sm bg-status-offline/80" style={{ height: `${banH}%` }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const Fail2banPanel = () => {
  const [stats, setStats] = useState<Fail2banStats | null>(null);
  const [jails, setJails] = useState<Fail2banJail[]>([]);
  const [banned, setBanned] = useState<BannedIp[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [jailFilter, setJailFilter] = useState<string>("all");
  const [unbanning, setUnbanning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, j, b] = await Promise.all([getFail2banStats(), getFail2banJails(), getFail2banBanned()]);
    setStats(s); setJails(j); setBanned(b); setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000); // live refresh every 30s
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    return banned.filter((b) =>
      (jailFilter === "all" || b.jail === jailFilter) &&
      (query === "" || b.ip.includes(query) || b.country?.toLowerCase().includes(query.toLowerCase()))
    );
  }, [banned, query, jailFilter]);

  const handleUnban = async (b: BannedIp) => {
    setUnbanning(b.ip);
    try {
      await unbanIp(b.ip, b.jail);
      setBanned((prev) => prev.filter((x) => !(x.ip === b.ip && x.jail === b.jail)));
      toast.success(`Unban · ${b.ip}`, { description: `${b.jail} liberado` });
    } catch {
      toast.error("Falha ao remover ban");
    } finally {
      setUnbanning(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header + refresh */}
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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Banidos agora" value={stats?.totalBanned ?? "—"} icon={ShieldOff} tone="danger" sub="ativos no jail" />
        <Stat label="Bans 24h" value={stats?.bannedLast24h ?? "—"} icon={Shield} tone="warning" sub="últimas 24 horas" />
        <Stat label="Tentativas 24h" value={stats?.failedLast24h.toLocaleString() ?? "—"} icon={AlertTriangle} tone="warning" sub="falhas auth" />
        <Stat label="Jails ativas" value={`${stats?.jailsActive ?? "—"}/${jails.length}`} icon={Activity} tone="ok" sub="filtros ativos" />
      </div>

      {/* Timeline + countries */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-surface-2/50 p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Atividade · 24h</p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-status-warning/40" /> tentativas</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-status-offline/80" /> bans</span>
            </div>
          </div>
          {stats ? <Sparkbars data={stats.attackTimeline} /> : <div className="h-20 animate-pulse rounded bg-surface-3" />}
        </div>

        <div className="rounded-xl border border-border/60 bg-surface-2/50 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <Globe className="h-3 w-3" /> Top origens
          </p>
          <div className="space-y-2">
            {stats?.topCountries.map((c) => {
              const pct = (c.count / (stats.topCountries[0]?.count || 1)) * 100;
              return (
                <div key={c.code} className="flex items-center gap-2 text-xs">
                  <span className="text-base">{flag(c.code)}</span>
                  <span className="w-24 truncate text-foreground">{c.name}</span>
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-status-offline/70" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-right font-mono tabular-nums text-muted-foreground">{c.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Jails */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Jails configuradas</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setJailFilter("all")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-smooth",
              jailFilter === "all" ? "border-primary bg-primary/10 text-foreground" : "border-border bg-surface-2/40 text-muted-foreground"
            )}
          >
            todas <span className="ml-1 font-mono text-[10px]">{banned.length}</span>
          </button>
          {jails.map((j) => (
            <button
              key={j.name}
              onClick={() => setJailFilter(j.name)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-smooth",
                jailFilter === j.name ? "border-primary bg-primary/10 text-foreground" : "border-border bg-surface-2/40 text-muted-foreground hover:text-foreground",
                !j.enabled && "opacity-50"
              )}
              title={`maxretry: ${j.maxretry} · bantime: ${j.bantime}s`}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", j.enabled ? "bg-status-online" : "bg-muted")} />
              <span className="font-mono">{j.name}</span>
              <span className="rounded bg-status-offline/15 px-1.5 py-0.5 font-mono text-[10px] text-status-offline">{j.currentlyBanned}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search + table */}
      <div className="rounded-xl border border-border/60 bg-surface-2/30">
        <div className="flex items-center gap-2 border-b border-border/60 p-3">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Procurar IP ou país…"
            className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0"
          />
          <span className="font-mono text-xs text-muted-foreground">
            {filtered.length} / {banned.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">IP</th>
                <th className="px-3 py-2 text-left font-medium">Origem</th>
                <th className="px-3 py-2 text-left font-medium">Jail</th>
                <th className="px-3 py-2 text-right font-medium">Tent.</th>
                <th className="px-3 py-2 text-left font-medium">Banido</th>
                <th className="px-3 py-2 text-left font-medium">Expira</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((b) => {
                const expired = b.expiresAt && new Date(b.expiresAt).getTime() < Date.now();
                return (
                  <tr key={`${b.ip}-${b.jail}`} className="transition-smooth hover:bg-surface-2/60">
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-foreground tabular-nums">{b.ip}</div>
                      {b.reason && <div className="text-[10px] text-muted-foreground">{b.reason}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-base leading-none">{flag(b.countryCode)}</span>
                        <span className="text-xs text-muted-foreground">{b.country ?? "—"}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-foreground">{b.jail}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-foreground">{b.attempts}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtRelative(b.bannedAt)}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {b.expiresAt ? (
                        <span className={cn(expired ? "text-status-online" : "text-status-warning")}>
                          {expired ? "expirado" : fmtRelative(b.expiresAt)}
                        </span>
                      ) : (
                        <span className="text-status-offline">permanente</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 text-xs hover:bg-status-online/10 hover:text-status-online"
                        onClick={() => handleUnban(b)}
                        disabled={unbanning === b.ip}
                      >
                        {unbanning === b.ip ? <Loader2 className="h-3 w-3 animate-spin" /> : "Unban"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">Sem IPs banidos para os filtros atuais.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
