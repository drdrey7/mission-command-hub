import { useEffect, useState } from "react";
import { Search, Server, FileText, Shield, MessageSquare, Sun, Moon, ClipboardList } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { AgentKey } from "@/data/mockData";

const AGENTS: { key: AgentKey; name: string }[] = [
  { key: "comandante", name: "Comandante" },
  { key: "cyber", name: "Cyber" },
  { key: "flow", name: "Flow" },
  { key: "ledger", name: "Ledger" },
];

interface Props {
  onTabChange: (tab: string) => void;
  onOpenChat: (agentKey?: string) => void;
}

export const CommandPalette = ({ onTabChange, onOpenChat }: Props) => {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const run = (fn: () => void) => { setOpen(false); setTimeout(fn, 50); };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-56 justify-between gap-2 px-3 text-xs text-muted-foreground sm:flex"
      >
        <span className="flex items-center gap-2"><Search className="h-3.5 w-3.5" /> Procurar ou comandar…</span>
        <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </Button>
      <Button variant="outline" size="icon" onClick={() => setOpen(true)} className="sm:hidden">
        <Search className="h-4 w-4" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Comando, agente, tab…" />
        <CommandList>
          <CommandEmpty>Sem resultados.</CommandEmpty>

          <CommandGroup heading="Navegar">
            <CommandItem onSelect={() => run(() => onTabChange("tasks"))}><ClipboardList className="mr-2 h-4 w-4" /> Ir para Tarefas</CommandItem>
            <CommandItem onSelect={() => run(() => onTabChange("vps"))}><Server className="mr-2 h-4 w-4" /> Ir para VPS</CommandItem>
            <CommandItem onSelect={() => run(() => onTabChange("fail2ban"))}><Shield className="mr-2 h-4 w-4" /> Ir para Fail2ban</CommandItem>
            <CommandItem onSelect={() => run(() => onTabChange("audit"))}><FileText className="mr-2 h-4 w-4" /> Ir para Audit</CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Conversar com agente">
            {AGENTS.map((a) => (
              <CommandItem key={a.key} onSelect={() => run(() => onOpenChat(a.key))}>
                <MessageSquare className="mr-2 h-4 w-4" /> Falar com {a.name}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Sistema">
            <CommandItem onSelect={() => run(() => setTheme(theme === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
              Mudar para tema {theme === "dark" ? "claro" : "escuro"}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};
