import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LeadModal } from "@/components/lead-modal";
import { toast } from "sonner";
import { formatBRL } from "@/lib/date-ranges";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/crm")({
  component: CRMPage,
});

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  origin: string;
  service: string;
  urgent: boolean;
  budget_amount: number | null;
  stage: string;
  entry_date: string;
  appointment_date: string | null;
  financing: string | null;
  checklist: Record<string, boolean>;
  notes: string | null;
  history: Array<{ at: string; text: string }>;
}

const COLUMNS = [
  { id: "novo", title: "Novo Lead", emoji: "🆕" },
  { id: "contato", title: "Contato Feito", emoji: "📞" },
  { id: "agendado", title: "Agendado", emoji: "📅" },
  { id: "orcamento", title: "Em Orçamento", emoji: "💰" },
  { id: "followup", title: "Follow-up Ativo", emoji: "🔄" },
  { id: "fechado", title: "Fechado", emoji: "✅" },
  { id: "perdido", title: "Perdido", emoji: "❌" },
] as const;

const ORIGIN_LABEL: Record<string, { text: string; cls: string }> = {
  anuncio_meta: { text: "Anúncio Meta", cls: "bg-destructive/15 text-destructive" },
  organico: { text: "Orgânico", cls: "bg-success/15 text-[#16A34A]" },
  indicacao: { text: "Indicação", cls: "bg-success/15 text-[#16A34A]" },
};

const SERVICE_LABEL: Record<string, { text: string; cls: string }> = {
  implante: { text: "Implante", cls: "bg-primary/15 text-primary" },
  aparelho: { text: "Aparelho", cls: "bg-warning/15 text-[#D97706]" },
  outros: { text: "Outros", cls: "bg-muted text-muted-foreground" },
};

function CRMPage() {
  const qc = useQueryClient();
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Lead[]) ?? [];
    },
  });

  const moveStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  function onDragStart(id: string) {
    setDraggingId(id);
  }
  function onDrop(stage: string) {
    if (!draggingId) return;
    moveStage.mutate({ id: draggingId, stage });
    setDraggingId(null);
  }

  return (
    <div className="p-8 space-y-6 h-screen flex flex-col">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM</h1>
          <p className="text-muted-foreground mt-1">Funil de vendas</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Lead
        </Button>
      </header>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 h-full min-w-max pb-2">
          {COLUMNS.map((col) => {
            const items = leads.filter((l) => l.stage === col.id);
            return (
              <div
                key={col.id}
                className="w-72 shrink-0 flex flex-col bg-card border border-border rounded-xl"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(col.id)}
              >
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span>{col.emoji}</span>
                    {col.title}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                    {items.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {items.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => onDragStart(lead.id)}
                      onClick={() => setOpenLead(lead)}
                      className={cn(
                        "bg-background border border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors",
                        draggingId === lead.id && "opacity-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-sm truncate">{lead.name}</h4>
                        {lead.urgent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple/15 text-[#7C3AED] font-medium shrink-0">
                            Urgente
                          </span>
                        )}
                      </div>
                      {lead.phone && (
                        <p className="text-xs text-muted-foreground mt-1">{lead.phone}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        <Tag {...ORIGIN_LABEL[lead.origin]} />
                        <Tag {...SERVICE_LABEL[lead.service]} />
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(lead.entry_date).toLocaleDateString("pt-BR")}
                        </span>
                        {lead.budget_amount && (
                          <span className="text-xs font-semibold text-primary">
                            {formatBRL(Number(lead.budget_amount))}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="text-center py-8 text-xs text-muted-foreground/60">
                      Sem leads
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(openLead || creating) && (
        <LeadModal
          lead={openLead}
          onClose={() => {
            setOpenLead(null);
            setCreating(false);
          }}
          onSaved={() => {
            toast.success("Lead salvo");
            qc.invalidateQueries({ queryKey: ["leads"] });
          }}
        />
      )}
    </div>
  );
}

function Tag({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", cls)}>{text}</span>
  );
}
