import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Rocket, Loader2 } from "lucide-react";
import { agents, AgentKey, Mission } from "@/data/mockData";
import { createMission } from "@/services/api";
import { AgentBadge } from "./AgentBadge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  onCreated: (m: Mission) => void;
}

export const MissionBuilder = ({ onCreated }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [codename, setCodename] = useState("");
  const [objective, setObjective] = useState("");
  const [lead, setLead] = useState<AgentKey>("comandante");
  const [squad, setSquad] = useState<AgentKey[]>(["comandante"]);
  const [priority, setPriority] = useState<"alta" | "média" | "baixa">("média");
  const [eta, setEta] = useState("2h 00m");

  const toggleSquad = (k: AgentKey) =>
    setSquad((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const submit = async () => {
    if (!codename.trim() || !objective.trim()) {
      toast.error("Codinome e objetivo são obrigatórios");
      return;
    }
    setLoading(true);
    try {
      const mission = await createMission({
        codename: codename.trim(),
        objective: objective.trim(),
        lead,
        squad: squad.length ? squad : [lead],
        priority,
        eta,
      });
      onCreated(mission);
      toast.success(`Missão ${mission.codename} criada · ${mission.id}`);
      setOpen(false);
      setCodename(""); setObjective(""); setSquad(["comandante"]); setPriority("média"); setEta("2h 00m");
    } catch (e) {
      toast.error("Falha ao criar missão");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Nova missão
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display uppercase tracking-wider">
            <Rocket className="h-4 w-4 text-primary" /> Mission Builder
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cn">Codinome</Label>
              <Input id="cn" value={codename} onChange={(e) => setCodename(e.target.value)} placeholder="Skyhawk II" />
            </div>
            <div>
              <Label htmlFor="eta">ETA</Label>
              <Input id="eta" value={eta} onChange={(e) => setEta(e.target.value)} placeholder="2h 00m" />
            </div>
          </div>

          <div>
            <Label htmlFor="obj">Objetivo</Label>
            <Textarea id="obj" value={objective} onChange={(e) => setObjective(e.target.value)} rows={3} placeholder="Onboarding automatizado de 3 clientes…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Líder</Label>
              <Select value={lead} onValueChange={(v) => setLead(v as AgentKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.key} value={a.key}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="média">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Esquadrão</Label>
            <div className="flex flex-wrap gap-2">
              {agents.map((a) => {
                const on = squad.includes(a.key);
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => toggleSquad(a.key)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-smooth",
                      on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
                    )}
                  >
                    <AgentBadge agent={a.key} size="sm" /> {a.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
            Lançar missão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
