import { useEffect, useMemo, useState } from "react";
import { getMemory, type MemoryEntry } from "@/services/api";
import { AgentBadge } from "./AgentBadge";
import type { AgentKey } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { Brain, Calendar } from "lucide-react";

const AGENT_LABEL: Record<AgentKey, string> = {
  comandante: "Comandante",
  cyber: "Cyber",
  flow: "Flow",
  ledger: "Ledger",
};

export const MemoryTab = () => {
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null);
  const [filter, setFilter] = useState<AgentKey | "all">("all");

  useEffect(() => {
    getMemory().then(setEntries);
  }, []);

  const filtered = useMemo(() => {
    const list = entries ?? [];
    return filter === "all" ? list : list.filter((e) => e.agent === filter);
  }, [entries, filter]);

  const agents: (AgentKey | "all")[] = ["all", "comandante", "cyber", "flow", "ledger"];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Brain className="h-3.5 w-3.5" />
          Memória dos agentes ·{" "}
          {entries === null ? "a carregar…" : `${filtered.length} entradas`}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {agents.map((a) => (
          <button
            key={a}
            onClick={() => setFilter(a)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-wider transition-smooth",
              filter === a
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-border/60 bg-surface-2/40 text-muted-foreground hover:text-foreground"
            )}
          >
            {a === "all" ? "Todos" : AGENT_LABEL[a]}
          </button>
        ))}
      </div>

      {entries !== null && filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Sem memória disponível
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e, i) => (
            <article
              key={`${e.agent}-${e.date}-${i}`}
              className="rounded-xl border border-border/60 bg-surface-2/40 p-4"
            >
              <header className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AgentBadge agent={e.agent} size="sm" />
                  <div>
                    <p className="font-display text-sm font-bold text-foreground">
                      {AGENT_LABEL[e.agent]}
                    </p>
                    <p className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {e.date}
                    </p>
                  </div>
                </div>
              </header>
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
                {e.content || "—"}
              </pre>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
