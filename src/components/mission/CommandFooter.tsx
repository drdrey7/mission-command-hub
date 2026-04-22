import { Plane } from "lucide-react";

export const CommandFooter = () => {
  return (
    <footer className="relative overflow-hidden rounded-[var(--radius)] border border-border bg-surface-1/60 px-6 py-5">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, hsl(var(--agent-comandante) / 0.08) 0 12px, transparent 12px 24px)",
        }}
      />
      <div className="relative flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-agent-comandante/40 bg-agent-comandante/10">
            <Plane className="h-4 w-4 text-agent-comandante" />
          </div>
          <div>
            <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">
              Hangar Control
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Sistema Operacional · openclaw
            </p>
          </div>
        </div>
        <p className="font-display text-xs uppercase tracking-[0.25em] text-muted-foreground sm:text-sm">
          “Planejar. Executar. Monitorar. Pousar com excelência.”
        </p>
      </div>
    </footer>
  );
};
