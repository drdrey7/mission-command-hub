import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical, RotateCw, Camera, Maximize2 } from "lucide-react";
import { vpsAction, VpsAction } from "@/services/api";
import { toast } from "sonner";

export const VpsActions = ({ nodeId, nodeName }: { nodeId: string; nodeName: string }) => {
  const run = async (action: VpsAction, label: string) => {
    const id = toast.loading(`${label} · ${nodeName}…`);
    try {
      await vpsAction(nodeId, action);
      toast.success(`${label} concluído`, { id });
    } catch {
      toast.error(`Falha em ${label.toLowerCase()}`, { id });
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase">{nodeName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run("restart", "Restart")}><RotateCw className="mr-2 h-3.5 w-3.5" /> Restart</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("snapshot", "Snapshot")}><Camera className="mr-2 h-3.5 w-3.5" /> Snapshot</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("scale", "Scale up")}><Maximize2 className="mr-2 h-3.5 w-3.5" /> Scale up</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
