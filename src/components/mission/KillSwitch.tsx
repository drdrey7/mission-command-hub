import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Power, AlertOctagon } from "lucide-react";
import { killSwitch, resumeOps } from "@/services/api";
import { toast } from "sonner";

export const KillSwitch = () => {
  const [reason, setReason] = useState("");
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);

  const trigger = async () => {
    setLoading(true);
    try {
      await killSwitch(reason || "Pausa manual");
      setPaused(true);
      toast.warning("Operações pausadas — todos os agentes em standby");
    } finally { setLoading(false); }
  };
  const resume = async () => {
    setLoading(true);
    try {
      await resumeOps();
      setPaused(false);
      toast.success("Operações retomadas");
    } finally { setLoading(false); }
  };

  if (paused) {
    return (
      <Button variant="outline" size="sm" onClick={resume} disabled={loading} className="gap-2 border-status-warning/40 text-status-warning">
        <Power className="h-4 w-4" /> Retomar
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-status-offline/40 text-status-offline hover:bg-status-offline/10">
          <AlertOctagon className="h-4 w-4" /> Kill switch
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-status-offline">
            <AlertOctagon className="h-5 w-5" /> Pausar todas as operações
          </AlertDialogTitle>
          <AlertDialogDescription>
            Todos os agentes serão colocados em <strong>standby</strong>. Missões em voo serão suspensas até retomar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div>
          <Label htmlFor="reason">Motivo (audit log)</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Anomalia detectada · investigação em curso" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={trigger} disabled={loading} className="bg-status-offline text-destructive-foreground hover:bg-status-offline/90">
            Confirmar pausa
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
