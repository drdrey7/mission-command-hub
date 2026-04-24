import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AlertTriangle, Loader2, MessageSquare, Mic, Send, Square } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentBadge } from "./AgentBadge";
import type { AgentKey, Agent } from "@/data/mockData";
import {
  getAgents,
  getChatThread,
  sendChat,
  transcribeChatAudio,
  ChatMessage,
} from "@/services/api";
import { cn } from "@/lib/utils";

const AGENT_KEYS: AgentKey[] = ["comandante", "cyber", "flow", "ledger"];
const NAMES: Record<AgentKey, string> = {
  comandante: "Comandante",
  cyber: "Cyber",
  flow: "Flow",
  ledger: "Ledger",
};
const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function mimeToExtension(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  return "webm";
}

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
  const [byAgent, setByAgent] = useState<Record<AgentKey, ChatMessage[]>>({
    comandante: [],
    cyber: [],
    flow: [],
    ledger: [],
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const shouldTranscribeRef = useRef(false);

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

  useEffect(() => {
    if (!open) {
      cancelRecording();
      releaseStream();
      setRecording(false);
      setTranscribing(false);
      setVoiceStatus(null);
    }
  }, [open]);

  const messages = byAgent[active];

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const cancelRecording = () => {
    shouldTranscribeRef.current = false;
    stopRecording();
  };

  const toggleRecording = async () => {
    if (transcribing) return;
    setVoiceError(null);
    setVoiceStatus(null);

    if (recording) {
      stopRecording();
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError("Este navegador não suporta gravação de áudio.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setVoiceError("Este navegador não suporta MediaRecorder.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      shouldTranscribeRef.current = true;
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setVoiceError("Falha na gravação de áudio.");
        setVoiceStatus(null);
        setRecording(false);
        setTranscribing(false);
        releaseStream();
      };

      recorder.onstop = async () => {
        setRecording(false);
        releaseStream();

        const chunks = chunksRef.current.slice();
        chunksRef.current = [];
        const shouldTranscribe = shouldTranscribeRef.current;
        shouldTranscribeRef.current = false;

        if (!shouldTranscribe) {
          setVoiceStatus(null);
          setTranscribing(false);
          return;
        }

        const fallbackType = mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: recorder.mimeType || fallbackType });
        if (!blob.size) {
          setVoiceError("Não foi captado áudio suficiente.");
          setVoiceStatus(null);
          return;
        }

        setTranscribing(true);
        setVoiceStatus("A transcrever áudio real…");
        try {
          const filename = `chat-${active}-${Date.now()}.${mimeToExtension(blob.type || fallbackType)}`;
          const result = await transcribeChatAudio(active, blob, {
            filename,
            mimeType: blob.type || fallbackType,
          });
          const transcript = String(result.transcript || "").trim();
          if (!transcript) {
            throw new Error("A transcrição regressou vazia.");
          }
          setInput(transcript);
          setVoiceStatus("Transcrição pronta. Podes rever antes de enviar.");
          setVoiceError(null);
          requestAnimationFrame(() => inputRef.current?.focus());
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : "Falha ao transcrever áudio.");
          setVoiceStatus(null);
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setRecording(true);
      setVoiceStatus("A gravar áudio… toca novamente para parar.");
    } catch (err) {
      setVoiceError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permissão de microfone recusada."
          : err instanceof Error
            ? err.message
            : "Não foi possível iniciar a gravação."
      );
      setVoiceStatus(null);
      releaseStream();
      setRecording(false);
    }
  };

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, transcribing]);

  useEffect(() => {
    return () => {
      cancelRecording();
      releaseStream();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const updateInset = () => {
      const viewport = window.visualViewport;
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(inset);
    };

    updateInset();
    window.visualViewport.addEventListener("resize", updateInset);
    window.visualViewport.addEventListener("scroll", updateInset);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateInset);
      window.visualViewport?.removeEventListener("scroll", updateInset);
    };
  }, []);

  const send = async () => {
    if (!input.trim() || loading || transcribing) return;
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
  const busy = loading || transcribing;

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
      <SheetContent
        side="right"
        className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden p-0 sm:max-w-md"
      >
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
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold">{agentName}</p>
            <p className="truncate text-xs text-muted-foreground">{agentInfo?.lastActivity ?? "—"}</p>
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

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
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
          {transcribing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Áudio a ser transcrito…
            </div>
          )}
        </div>

        <div
          className="border-t border-border bg-surface-1/70 px-3 pt-3"
          style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${keyboardInset}px + 0.75rem)` }}
        >
          {voiceStatus && (
            <p className="mb-2 flex items-start gap-2 text-[11px] text-muted-foreground">
              <Mic className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", recording ? "text-status-offline" : "text-muted-foreground")} />
              <span>{voiceStatus}</span>
            </p>
          )}
          {voiceError && (
            <p className="mb-2 flex items-start gap-2 text-[11px] text-status-offline">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{voiceError}</span>
            </p>
          )}
          <div className="flex items-end gap-2">
            <Button
              type="button"
              size="icon"
              variant={recording ? "destructive" : "outline"}
              onClick={toggleRecording}
              disabled={busy}
              aria-pressed={recording}
              aria-label={recording ? "Parar gravação" : "Gravar mensagem de voz"}
              className="shrink-0"
            >
              {recording ? <Square className="h-4 w-4" /> : transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              placeholder={`Mensagem para ${agentName}…`}
              disabled={busy}
              className="h-11"
            />
            <Button onClick={send} disabled={busy || !input.trim()} size="icon" className="shrink-0 h-11 w-11">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
