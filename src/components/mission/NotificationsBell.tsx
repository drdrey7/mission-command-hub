import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, Info, ShieldAlert, CheckCheck, RefreshCw } from "lucide-react";
import { getNotifications, markNotificationsRead, NotificationsFeedResponse } from "@/services/api";
import { cn } from "@/lib/utils";

const levelIcon = {
  info: { I: Info, cls: "text-accent" },
  warning: { I: AlertTriangle, cls: "text-status-warning" },
  critical: { I: ShieldAlert, cls: "text-status-offline" },
};

export const NotificationsBell = () => {
  const [feed, setFeed] = useState<NotificationsFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await getNotifications();
      setFeed(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar notificações");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await getNotifications();
        if (cancelled) return;
        setFeed(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar notificações");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const items = feed?.items ?? [];
  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);
  const backendNotice = feed?.errors?.[0] || feed?.warnings?.[0] || null;

  const markRead = async (ids: string[]) => {
    if (ids.length === 0 || marking) return;
    setMarking(true);
    try {
      await markNotificationsRead(ids);
      setFeed((prev) => {
        if (!prev) return prev;
        const nextItems = prev.items.map((item) => ids.includes(item.id) ? { ...item, read: true } : item);
        return {
          ...prev,
          unreadCount: nextItems.filter((item) => !item.read).length,
          items: nextItems,
        };
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao marcar notificações como lidas");
    } finally {
      setMarking(false);
    }
  };

  const unreadIds = useMemo(() => items.filter((n) => !n.read).map((n) => n.id), [items]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-wider">Notificações</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {feed?.source || "openclaw-activity"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={loading || marking} className="h-8 w-8">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void markRead(unreadIds)}
              disabled={marking || unreadIds.length === 0}
              className="h-8 gap-1.5 px-2 text-[11px]"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Lidas
            </Button>
          </div>
        </div>
        {error && (
          <div className="border-b border-status-offline/20 bg-status-offline/5 px-4 py-2 text-xs text-status-offline">
            {error}
          </div>
        )}
        {!error && backendNotice && (
          <div className="border-b border-status-warning/20 bg-status-warning/5 px-4 py-2 text-xs text-status-warning">
            {backendNotice}
          </div>
        )}
        <div className="max-h-96 divide-y divide-border overflow-y-auto">
          {items.map((n) => {
            const { I, cls } = levelIcon[n.level];
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => !n.read && void markRead([n.id])}
                className={cn(
                  "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/40",
                  !n.read && "bg-accent/5"
                )}
              >
                <I className={cn("mt-0.5 h-4 w-4 shrink-0", cls)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-sm", n.read ? "font-medium text-foreground/80" : "font-semibold text-foreground")}>{n.title}</p>
                    {!n.read && <span className="mt-1 h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{n.time}</p>
                </div>
              </button>
            );
          })}
          {loading && items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">A carregar notificações reais…</p>
          )}
          {!loading && items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sem notificações reais</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
