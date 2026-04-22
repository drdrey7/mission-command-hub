import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { AgentBadge } from "./AgentBadge";
import { agents, AgentKey } from "@/data/mockData";
import { sendChat, ChatMessage } from "@/services/api";
import { cn } from "@/lib/utils";

interface AgentChatProps {
  externalAgent?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const AgentChat = ({ externalAgent, open: openProp, onOpenChange }: AgentChatProps = {}) => {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange?.(v);
  };
  const [active, setActive] = useState<AgentKey>("comandante");

  useEffect(() => {
    if (externalAgent && (["comandante", "cyber", "flow", "ledger"] as const).includes(externalAgent as AgentKey)) {
      setActive(externalAgent as AgentKey);
    }
  }, [externalAgent]);
  const [byAgent, setByAgent] = useState<Record<AgentKey, ChatMessage[]>>({
    comandante: [], cyber: [], flow: [], ledger: [],
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = byAgent[active];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const next = [...messages, userMsg];
    setByAgent((p) => ({ ...p, [active]: next }));
    setInput("");
    setLoading(true);
    try {
      const { reply } = await sendChat(active, next);
      setByAgent((p) => ({ ...p, [active]: [...next, { role: "assistant", content: reply }] }));
    } finally {
      setLoading(false);
    }
  };

  const agentInfo = agents.find((a) => a.key === active)!;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full p-0 shadow-glow-gold"
          aria-label="Abrir chat com agentes"
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-display text-base uppercase tracking-wider">
            Comunicação com agentes
          </SheetTitle>
        </SheetHeader>

        {/* Agent selector */}
        <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3">
          {agents.map((a) => (
            <button
              key={a.key}
              onClick={() => setActive(a.key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-smooth",
                active === a.key
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-surface-2/40 text-muted-foreground hover:text-foreground"
              )}
            >
              <AgentBadge agent={a.key} size="sm" />
              <span>{a.name}</span>
            </button>
          ))}
        </div>

        {/* Header strip */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-2/30 px-5 py-3">
          <AgentBadge agent={active} working={agentInfo.status === "working"} />
          <div>
            <p className="font-display text-sm font-bold">{agentInfo.name}</p>
            <p className="text-xs text-muted-foreground">{agentInfo.role}</p>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              Inicia a conversa com <span className="text-foreground">{agentInfo.name}</span>.
              <br />
              Tenta: <em>"Qual o status da missão Skyhawk?"</em>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-surface-2/70 text-foreground"
              )}
            >
              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {agentInfo.name} a redigir…
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-surface-1/60 p-3">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              placeholder={`Mensagem para ${agentInfo.name}…`}
              disabled={loading}
            />
            <Button onClick={send} disabled={loading || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
