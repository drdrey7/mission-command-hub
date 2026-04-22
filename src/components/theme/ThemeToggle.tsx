import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

export const ThemeToggle = ({ className }: { className?: string }) => {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema"
      className={cn(
        "group relative inline-flex h-9 w-16 items-center rounded-full border border-border/60 bg-surface-2/80 px-1 transition-smooth hover:border-agent-comandante/50",
        className
      )}
    >
      <span
        className={cn(
          "absolute top-1 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-agent-comandante to-primary shadow-[0_0_18px_hsl(var(--agent-comandante)/0.5)] transition-all duration-300",
          isDark ? "left-1" : "left-8"
        )}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-background" strokeWidth={2.5} />
        ) : (
          <Sun className="h-3.5 w-3.5 text-background" strokeWidth={2.5} />
        )}
      </span>
      <Sun
        className={cn(
          "ml-1 h-3.5 w-3.5 transition-opacity",
          isDark ? "opacity-30 text-muted-foreground" : "opacity-0"
        )}
      />
      <Moon
        className={cn(
          "ml-auto mr-1.5 h-3.5 w-3.5 transition-opacity",
          isDark ? "opacity-0" : "opacity-30 text-muted-foreground"
        )}
      />
    </button>
  );
};
