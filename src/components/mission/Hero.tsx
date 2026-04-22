import { Plane, Radio } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

export const Hero = () => {
  return (
    <section className="relative overflow-hidden rounded-[var(--radius)] border border-border bg-surface-1/60 p-8 sm:p-12">
      {/* Grid background */}
      <div className="grid-bg absolute inset-0 opacity-40" />

      {/* Gold radial glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-agent-comandante/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[300px] w-[500px] rounded-full bg-accent/20 blur-[100px]" />

      {/* Plane decoration */}
      <Plane
        className="pointer-events-none absolute right-8 top-8 h-32 w-32 rotate-[25deg] text-foreground/[0.04]"
        strokeWidth={1}
      />

      <div className="relative">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status="online" label="Sistemas Operacionais" />
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface-1/80 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Radio className="h-3 w-3" />
            Openclaw VPS · Hangar 01
          </div>
        </div>

        <h1 className="mt-6 font-display text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          <span className="text-gradient-gold">Mission</span>{" "}
          <span className="text-foreground">Control</span>
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Centro de controlo operacional dos agentes. Planejar, executar, monitorar — pousar com excelência.
        </p>

        {/* Metric strip */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[
            { label: "Agentes", value: "4", sub: "ativos" },
            { label: "Uptime", value: "99.98%", sub: "30 dias" },
            { label: "Tarefas hoje", value: "07", sub: "em fila" },
            { label: "Eventos", value: "142", sub: "últimas 24h" },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-xl border border-border/60 bg-surface-2/60 p-4 backdrop-blur"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {m.label}
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
