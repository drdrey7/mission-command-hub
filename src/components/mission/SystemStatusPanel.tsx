import { useEffect, useState } from "react";
import { Activity, Server, Shield, ChevronRight, Cpu, MemoryStick, HardDrive } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { getFail2banStats, getVpsSnapshot } from "@/services/api";
import type { Fail2banStats, VpsSnapshotResponse } from "@/services/api";
import { cn } from "@/lib/utils";

interface Props {
  onSeeFail2ban?: () => void;
  onSeeVps?: () => void;
}

const Bar = ({ value, tone }: { value: number; tone: "ok" | "warn" | "bad" }) => {
  const color = tone === "bad" ? "bg-status-offline" : tone === "warn" ? "bg-status-warning" : "bg-status-online";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
};

const toneFor = (v: number | null): "ok" | "warn" | "bad" => {
  if (v === null) return "ok";
  if (v > 85) return "bad";
  if (v > 65) return "warn";
  return "ok";
};

const Metric = ({ icon: Icon, label, value, raw, tone }: {
  icon: typeof Cpu;
  label: string;
  value: number | null;
  raw: string;
  tone: "ok" | "warn" | "bad";
}) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className="font-mono text-foreground tabular-nums">{raw}</span>
    </div>
    <Bar value={value ?? 0} tone={tone} />
  </div>
);

export const SystemStatusPanel = ({ onSeeFail2ban, onSeeVps }: Props) => {
  const [snapshot, setSnapshot] = useState<VpsSnapshotResponse | null>(null);
  const [fail2ban, setFail2ban] = useState<Fail2banStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [vpsSnapshot, fail2banStats] = await Promise.allSettled([getVpsSnapshot(), getFail2banStats()]);
      setSnapshot(vpsSnapshot.status === "fulfilled" ? vpsSnapshot.value : null);
      setFail2ban(fail2banStats.status === "fulfilled" ? fail2banStats.value : null);
      const messages = [
        vpsSnapshot.status === "rejected" ? (vpsSnapshot.reason instanceof Error ? vpsSnapshot.reason.message : String(vpsSnapshot.reason)) : null,
        fail2banStats.status === "rejected" ? (fail2banStats.reason instanceof Error ? fail2banStats.reason.message : String(fail2banStats.reason)) : null,
      ].filter(Boolean);
      setError(messages.length > 0 ? messages.join(" · ") : null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const host = snapshot?.host ?? null;
  const hostError = snapshot?.errors?.[0] ?? null;
  const fail2banError = fail2ban?.errors?.[0] ?? null;
  const bannedCount = fail2ban?.bannedCount ?? fail2ban?.totalBanned ?? null;
  const systemStatus = hostError || error || fail2banError ? "warning" : "online";

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface-2">
            <Activity className="h-4 w-4 text-status-online" />
          </div>
          <div>
            <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
              VPS · {host?.hostname ?? "—"}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {loading ? "a carregar…" : host?.uptime ? `Uptime ${host.uptime}` : "sem uptime disponível"}
            </p>
          </div>
        </div>
        <StatusBadge status={systemStatus} />
      </div>

      {hostError && (
        <div className="mt-3 rounded-lg border border-status-offline/30 bg-status-offline/5 px-3 py-2 text-xs text-status-offline">
          {hostError}
        </div>
      )}

      {error && !hostError && (
        <div className="mt-3 rounded-lg border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-xs text-status-warning">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        <Metric
          icon={Cpu}
          label="CPU"
          value={host?.cpuPercent ?? null}
          raw={host?.cpuPercent === null ? "—" : `${host.cpuPercent.toFixed(1)}%`}
          tone={toneFor(host?.cpuPercent ?? null)}
        />
        <Metric
          icon={MemoryStick}
          label="RAM"
          value={host?.ramPercent ?? null}
          raw={host?.ramUsed && host?.ramTotal ? `${host.ramUsed}/${host.ramTotal}` : "—"}
          tone={toneFor(host?.ramPercent ?? null)}
        />
        <Metric
          icon={HardDrive}
          label="Disco"
          value={host?.diskUsedPercent ?? null}
          raw={host?.diskUsedPercent === null ? "—" : `${host.diskUsedPercent.toFixed(1)}%`}
          tone={toneFor(host?.diskUsedPercent ?? null)}
        />
      </div>

      <button
        onClick={onSeeVps}
        className="mt-4 flex items-center justify-between rounded-lg border border-border/60 bg-surface-2/40 p-2.5 text-left text-xs transition-smooth hover:border-border hover:bg-surface-2"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <Server className="h-3.5 w-3.5" />
          {snapshot?.containers?.length ?? 0} containers
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      <button
        onClick={onSeeFail2ban}
        className={cn(
          "mt-2 flex items-center justify-between rounded-lg border p-3 text-left transition-smooth",
          (bannedCount ?? 0) > 0
            ? "border-status-offline/30 bg-status-offline/5 hover:border-status-offline/50 hover:bg-status-offline/10"
            : "border-border/60 bg-surface-2/40 hover:border-border hover:bg-surface-2"
        )}
      >
        <div className="flex items-center gap-2.5">
          <Shield className={cn("h-4 w-4", (bannedCount ?? 0) > 0 ? "text-status-offline" : "text-muted-foreground")} />
          <div>
            <p className="text-xs font-semibold text-foreground">Fail2ban</p>
            <p className="text-[10px] text-muted-foreground">
              {loading
                ? "a carregar…"
                : fail2banError
                  ? fail2banError
                  : bannedCount === null
                    ? "sem dados disponíveis"
                    : bannedCount > 0
                      ? `${bannedCount} IPs banidos agora`
                      : "Nenhum IP banido actualmente"}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
};
