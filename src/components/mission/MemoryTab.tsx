import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  getLatestMemory,
  getMemoryDay,
  getMemoryIndex,
  type MemoryDayResponse,
  type MemoryEntry,
  type MemoryIndexResponse,
} from "@/services/api";
import { cn } from "@/lib/utils";
import { AlertCircle, CalendarDays, Brain, RefreshCw } from "lucide-react";

const REAL_AGENTS = ["comandante", "cyber", "flow", "ledger"] as const;
type RealAgent = (typeof REAL_AGENTS)[number];

const AGENT_LABEL: Record<RealAgent, string> = {
  comandante: "Comandante",
  cyber: "Cyber",
  flow: "Flow",
  ledger: "Ledger",
};

const AGENT_TONES: Record<RealAgent, string> = {
  comandante: "border-amber-500/30 bg-amber-500/8 text-amber-200",
  cyber: "border-sky-500/30 bg-sky-500/8 text-sky-200",
  flow: "border-emerald-500/30 bg-emerald-500/8 text-emerald-200",
  ledger: "border-violet-500/30 bg-violet-500/8 text-violet-200",
};

function normalizeAgent(agent: string) {
  return agent.trim().toLowerCase();
}

function formatTimestamp(value: string | null) {
  if (!value) return "sem atualização";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function dedupeAgents(index?: MemoryIndexResponse | null, day?: MemoryDayResponse | null) {
  const discovered = new Set<string>();
  for (const agent of REAL_AGENTS) discovered.add(agent);
  for (const agent of index?.agents ?? []) discovered.add(normalizeAgent(agent));
  for (const agent of day?.agents ?? []) discovered.add(normalizeAgent(agent));
  for (const entry of day?.entries ?? []) discovered.add(normalizeAgent(entry.agent));
  return Array.from(discovered);
}

function getEntry(entries: MemoryEntry[], agent: string) {
  return entries.find((entry) => normalizeAgent(entry.agent) === agent) ?? null;
}

export const MemoryTab = () => {
  const [index, setIndex] = useState<MemoryIndexResponse | null>(null);
  const [dayPayload, setDayPayload] = useState<MemoryDayResponse | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>(REAL_AGENTS[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInitial = async () => {
    setLoading(true);
    setError(null);

    try {
      const [indexResponse, latestResponse] = await Promise.all([
        getMemoryIndex(),
        getLatestMemory(),
      ]);

      const nextDay = latestResponse.day ?? indexResponse.latestDay ?? indexResponse.days[0]?.day ?? null;
      setIndex(indexResponse);
      setDayPayload(latestResponse);
      setSelectedDay(nextDay);

      const availableAgents = dedupeAgents(indexResponse, latestResponse);
      setSelectedAgent((current) => {
        const currentNormalized = normalizeAgent(current);
        return availableAgents.includes(currentNormalized)
          ? currentNormalized
          : availableAgents[0] ?? REAL_AGENTS[0];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha a carregar memória");
      setIndex(null);
      setDayPayload(null);
      setSelectedDay(null);
    } finally {
      setLoading(false);
    }
  };

  const loadDay = async (day: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await getMemoryDay(day);
      setDayPayload(response);
      setSelectedDay(response.day ?? day);

      const availableAgents = dedupeAgents(index, response);
      setSelectedAgent((current) => {
        const currentNormalized = normalizeAgent(current);
        return availableAgents.includes(currentNormalized)
          ? currentNormalized
          : availableAgents[0] ?? REAL_AGENTS[0];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha a carregar o dia selecionado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (selectedDay) {
        void loadDay(selectedDay);
      } else {
        void loadInitial();
      }
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [selectedDay]);

  const days = index?.days ?? [];
  const availableAgents = useMemo(() => dedupeAgents(index, dayPayload), [index, dayPayload]);
  const entries = dayPayload?.entries ?? [];
  const agentOrder = useMemo(
    () => {
      const realAgents = REAL_AGENTS.filter((agent) => availableAgents.includes(agent));
      const extras = availableAgents.filter((agent) => !REAL_AGENTS.includes(agent as RealAgent));
      return [...realAgents, ...extras];
    },
    [availableAgents]
  );
  const activeDay = selectedDay ?? dayPayload?.day ?? index?.latestDay ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Brain className="h-3.5 w-3.5" />
            Memory local · dados reais
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeDay ? `Dia ${activeDay}` : "Sem dia disponível"}
            {dayPayload?.mtime ? ` · atualizado em ${formatTimestamp(dayPayload.mtime)}` : ""}
          </p>
          {index?.source ? (
            <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              Fonte: {index.source}
              {index.indexExists ? " · index.json presente" : " · scan do filesystem"}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => {
            if (activeDay) {
              void loadDay(activeDay);
            } else {
              void loadInitial();
            }
          }}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border/60 bg-surface-2/50 px-3 py-1.5 text-xs font-medium text-foreground transition-smooth hover:border-accent/50 hover:bg-accent/10"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Atualizar
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          Dia
        </div>
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            {days.length > 0 ? (
              days.map((entry) => (
                <button
                  key={entry.day}
                  type="button"
                  onClick={() => void loadDay(entry.day)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-smooth",
                    activeDay === entry.day
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-border/60 bg-surface-2/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {entry.day}
                </button>
              ))
            ) : (
              <span className="rounded-full border border-dashed border-border/60 px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                Sem dias indexados
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Agentes</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {agentOrder.map((agent) => {
            const label = AGENT_LABEL[agent as RealAgent] ?? agent;
            return (
              <button
                key={agent}
                type="button"
                onClick={() => setSelectedAgent(agent)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-smooth",
                  selectedAgent === agent
                    ? "border-accent/50 bg-accent/10"
                    : "border-border/60 bg-surface-2/40 hover:border-border/80"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {label}
                  </span>
                  <span className={cn("h-2 w-2 rounded-full", AGENT_TONES[agent as RealAgent] ? "bg-accent" : "bg-muted-foreground")} />
                </div>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {getEntry(entries, agent)?.exists ? "resumo disponível" : "sem ficheiro"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-status-warning/40 bg-status-warning/10 p-4 text-sm text-status-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      ) : null}

      {loading && !dayPayload ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          A carregar resumo local…
        </div>
      ) : null}

      {activeDay && agentOrder.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {agentOrder.map((agent) => {
            const entry = getEntry(entries, agent);
            const label = AGENT_LABEL[agent as RealAgent] ?? agent;
            const selected = selectedAgent === agent;
            return (
              <article
                key={`${activeDay}-${agent}`}
                className={cn(
                  "rounded-2xl border bg-surface-2/40 p-4 shadow-sm transition-smooth",
                  selected ? "border-accent/50 ring-1 ring-accent/20" : "border-border/60"
                )}
              >
                <header className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">{label}</p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {activeDay} · {entry?.mtime ? formatTimestamp(entry.mtime) : "sem atualização"}
                    </p>
                  </div>
                  <span className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    entry?.exists
                      ? "border-status-online/40 bg-status-online/10 text-status-online"
                      : "border-status-warning/40 bg-status-warning/10 text-status-warning"
                  )}>
                    {entry?.exists ? "ok" : "missing"}
                  </span>
                </header>

                {entry?.exists ? (
                  <div className="prose prose-sm max-w-none prose-headings:font-display prose-headings:tracking-tight prose-p:my-2 prose-pre:my-3 prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-border/60 prose-pre:bg-surface-1/60 prose-pre:p-3 prose-code:rounded prose-code:bg-surface-1/80 prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none">
                    <ReactMarkdown>{entry.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-surface-1/40 p-4 text-sm text-muted-foreground">
                    Sem resumo desse dia
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Sem resumo disponível
        </div>
      )}
    </div>
  );
};
