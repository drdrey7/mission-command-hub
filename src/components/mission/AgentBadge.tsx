import { useEffect, useState } from "react";
import { Crown, Shield, Workflow, BookOpen, Plane, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentKey } from "@/data/mockData";

const map: Record<AgentKey, { icon: LucideIcon; color: string; bg: string; ring: string }> = {
  comandante: {
    icon: Crown,
    color: "text-agent-comandante",
    bg: "bg-agent-comandante/10",
    ring: "border-agent-comandante/40",
  },
  cyber: {
    icon: Shield,
    color: "text-agent-cyber",
    bg: "bg-agent-cyber/10",
    ring: "border-agent-cyber/40",
  },
  flow: {
    icon: Workflow,
    color: "text-agent-flow",
    bg: "bg-agent-flow/10",
    ring: "border-agent-flow/40",
  },
  ledger: {
    icon: BookOpen,
    color: "text-agent-ledger",
    bg: "bg-agent-ledger/10",
    ring: "border-agent-ledger/40",
  },
};

const sizeMap = {
  sm: { box: "h-10 w-10", icon: "h-5 w-5", orbit: 22, plane: "h-2.5 w-2.5" },
  md: { box: "h-12 w-12", icon: "h-6 w-6", orbit: 28, plane: "h-3 w-3" },
  lg: { box: "h-16 w-16", icon: "h-8 w-8", orbit: 38, plane: "h-3.5 w-3.5" },
};

interface Props {
  agent: AgentKey;
  working?: boolean;
  size?: keyof typeof sizeMap;
  className?: string;
}

export const AgentBadge = ({ agent, working = false, size = "md", className }: Props) => {
  const cfg = map[agent];
  const sz = sizeMap[size];
  const Icon = cfg.icon;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      {working && (
        <>
          {/* Orbit dashed ring */}
          <span
            className={cn(
              "absolute rounded-full border border-dashed opacity-60",
              cfg.ring
            )}
            style={{
              width: sz.orbit * 2 + 16,
              height: sz.orbit * 2 + 16,
            }}
          />
          {/* Orbiting plane */}
          <span
            className="orbit absolute"
            style={{ ["--orbit-r" as string]: `${sz.orbit + 8}px` }}
          >
            <Plane
              className={cn(sz.plane, cfg.color, "rotate-90 drop-shadow-[0_0_6px_currentColor]")}
              strokeWidth={2.5}
            />
          </span>
        </>
      )}
      <div
        className={cn(
          "relative flex items-center justify-center rounded-xl border",
          sz.box,
          cfg.bg,
          cfg.ring,
          working && "float-y"
        )}
      >
        <Icon className={cn(sz.icon, cfg.color)} strokeWidth={2} />
      </div>
    </div>
  );
};

/** Live HH:MM:SS countdown from a start timestamp (flight hours). */
export const FlightTimer = ({
  startedAt,
  className,
}: {
  startedAt: number;
  className?: string;
}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {h}:{m}:{s}
    </span>
  );
};
