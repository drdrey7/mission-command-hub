import { Plane } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationsBell } from "./NotificationsBell";
import { CommandPalette } from "./CommandPalette";

interface Props {
  onTabChange: (tab: string) => void;
  onOpenChat: (agentKey?: string) => void;
}

export const TopBar = ({ onTabChange, onOpenChat }: Props) => {
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-agent-comandante/40 bg-agent-comandante/10">
            <Plane className="h-4 w-4 text-agent-comandante" />
          </div>
          <div className="hidden sm:block">
            <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground leading-none">
              openclaw
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground leading-none">
              Mission Control
            </p>
          </div>
          <span className="hidden h-5 w-px bg-border md:block" />
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:inline-flex md:items-center md:gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-online" />
            Hangar 01 · Lisboa
          </span>
        </div>

        <div className="flex items-center gap-2">
          <CommandPalette onTabChange={onTabChange} onOpenChat={onOpenChat} />
          <NotificationsBell />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
