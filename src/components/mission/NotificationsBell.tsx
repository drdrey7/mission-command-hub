import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { getNotifications, Notification } from "@/services/api";
import { cn } from "@/lib/utils";

const levelIcon = {
  info: { I: Info, cls: "text-accent" },
  warning: { I: AlertTriangle, cls: "text-status-warning" },
  critical: { I: ShieldAlert, cls: "text-status-offline" },
};

export const NotificationsBell = () => {
  const [items, setItems] = useState<Notification[]>([]);
  useEffect(() => { getNotifications().then(setItems); }, []);
  const unread = items.filter((n) => !n.read).length;

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
        <div className="border-b border-border px-4 py-3">
          <p className="font-display text-xs font-bold uppercase tracking-wider">Notificações</p>
        </div>
        <div className="max-h-96 divide-y divide-border overflow-y-auto">
          {items.map((n) => {
            const { I, cls } = levelIcon[n.level];
            return (
              <div key={n.id} className="flex gap-3 px-4 py-3 hover:bg-surface-2/40">
                <I className={cn("mt-0.5 h-4 w-4 shrink-0", cls)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{n.time}</p>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sem notificações</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
