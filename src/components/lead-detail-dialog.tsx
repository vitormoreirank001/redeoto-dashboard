import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LeadPanel } from "@/components/chat/lead-panel";
import { ChatColumn } from "@/components/lead-modal";
import type { Lead } from "@/routes/_authenticated/crm";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Abre o lead a partir do CRM no mesmo painel estilo Kommo do Chat (abas,
 * edição inline campo a campo) em vez do form antigo de ~15 campos numa aba
 * só — pedido do Vitor pra unificar a experiência entre CRM e Chat. Conversa
 * do WhatsApp continua ao lado (mesma ideia do modal antigo); o lápis dentro
 * do painel ainda abre o form completo (LeadModal) pra editar nome/telefone
 * ou excluir o lead.
 */
export function LeadDetailDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const canChat = !!lead.phone_e164;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "bg-card border-border p-0 gap-0 overflow-hidden flex",
          canChat ? "max-w-5xl h-[85vh]" : "max-w-lg h-[85vh]",
        )}
      >
        <DialogTitle className="sr-only">{lead.name}</DialogTitle>
        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 p-3 border-b border-border shrink-0">
            <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
              {initials(lead.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{lead.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {lead.phone || "Sem telefone"}
              </p>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <LeadPanel lead={lead} />
          </div>
        </div>
        {canChat && <ChatColumn lead={lead} />}
      </DialogContent>
    </Dialog>
  );
}
