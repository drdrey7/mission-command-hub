import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2, MessageSquare, Send } from "lucide-react";
import { AgentBadge } from "./AgentBadge";
import type { AgentKey, Agent } from "@/data/mockData";
import { getAgents, getChatThread, sendChat, ChatMessage } from "@/services/api";
import { cn } from "@/lib/utils";

const AGENT_KEYS: AgentKey[] = ["comandante", "cyber", "flow", "ledger"];
const NAMES: Record<AgentKey, string> = {
  comandante: "Comandante", cyber: "Cyber", flow: "Flow", ledger: "Ledger",
};

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
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getAgents()
      .then((data) => {
        if (!cancelled) setAgents(data);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (externalAgent && AGENT_KEYS.includes(externalAgent as AgentKey)) {
      setActive(externalAgent as AgentKey);
    }
  }, [externalAgent]);

  const [byAgent, setByAgent] = useState<Record<AgentKey, ChatMessage[]>>({
    comandante: [], cyber: [], flow: [], ledger: [],
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = byAgent[active];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;
    const loadThread = async () => {
      if (!open) return;
      setLoadingThread(true);
      try {
        const thread = await getChatThread(active);
        if (cancelled) return;
        setByAgent((prev) => ({
          ...prev,
          [active]: Array.isArray(thread.messages)
            ? thread.messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
                id: msg.id,
                at: msg.at ?? null,
                source: msg.source ?? null,
                sessionKey: msg.sessionKey ?? null,
                sessionId: msg.sessionId ?? null,
                status: msg.status ?? null,
                error: msg.error ?? null,
              }))
            : prev[active],
        }));
        setChatError(null);
      } catch (err) {
        if (!cancelled) {
          setChatError(err instanceof Error ? err.message : "Falha ao carregar conversa");
        }
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    };

    void loadThread();
    return () => {
      cancelled = true;
    };
  }, [active, open]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const message = input.trim();
    const userMsg: ChatMessage = { role: "user", content: message };
    const next = [...messages, userMsg];
    setByAgent((p) => ({ ...p, [active]: next }));
    setInput("");
    setLoading(true);
    try {
      const response = await sendChat(active, message);
      const hydrated = Array.isArray(response.messages) && response.messages.length > 0
        ? response.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            id: msg.id,
            at: msg.at ?? null,
            source: msg.source ?? null,
            sessionKey: msg.sessionKey ?? null,
            sessionId: msg.sessionId ?? null,
            status: msg.status ?? null,
            error: msg.error ?? null,
          }))
        : [...next, { role: "assistant", content: response.reply }];
      setByAgent((p) => ({ ...p, [active]: hydrated }));
      setChatError(null);
    } catch (err) {
      setByAgent((p) => ({ ...p, [active]: messages }));
      setInput(message);
      setChatError(err instanceof Error ? err.message : "Falha ao enviar mensagem");
    } finally {
      setLoading(false);
    }
  };

  const agentInfo = agents.find((a) => a.key === active);
  const agentName = agentInfo?.name ?? NAMES[active];
  const inFlight = agentInfo?.status === "em_voo";

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

        <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3">
          {AGENT_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => setActive(k)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-smooth",
                active === k
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-surface-2/40 text-muted-foreground hover:text-foreground"
              )}
            >
              <AgentBadge agent={k} size="sm" />
              <span>{NAMES[k]}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 border-b border-border bg-surface-2/30 px-5 py-3">
          <AgentBadge agent={active} working={inFlight} />
          <div>
            <p className="font-display text-sm font-bold">{agentName}</p>
            <p className="text-xs text-muted-foreground">{agentInfo?.lastActivity ?? "—"}</p>
          </div>
        </div>

        {chatError && (
          <div className="border-b border-status-offline/20 bg-status-offline/5 px-5 py-2 text-xs text-status-offline">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{chatError}</span>
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {loadingThread && messages.length === 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              A carregar conversa real…
            </div>
          )}
          {!loadingThread && messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              Inicia a conversa com <span className="text-foreground">{agentName}</span>.
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
              {m.status === "failed" && (
                <p className="mt-1 text-[10px] uppercase tracking-wider text-status-offline">Falha ao enviar</p>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {agentName} a redigir…
            </div>
          )}
        </div>

        <div className="border-t border-border bg-surface-1/60 p-3">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              placeholder={`Mensagem para ${agentName}…`}
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
