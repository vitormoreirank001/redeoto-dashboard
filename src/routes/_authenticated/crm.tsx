import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, AlertTriangle, Search, X } from "lucide-react";
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
  media: string;
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
  calls_made: number;
  calls_answered: number;
  custom_data: Record<string, string | number | boolean | null>;
  updated_at: string;
}

const SLA_MS: Record<string, number> = {
  novo: 30 * 60 * 1000, // 30 min sem mover de "Novo Lead"
  contato: 24 * 60 * 60 * 1000, // 24h sem mover de "Contato Feito"
};

function isOverdue(lead: Lead) {
  const sla = SLA_MS[lead.stage];
  if (!sla) return false;
  return Date.now() - new Date(lead.updated_at).getTime() > sla;
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

const SERVICE_LABEL: Record<string, { text: string; cls: string }> = {
  implante: { text: "Implante", cls: "bg-primary/15 text-primary" },
  aparelho: { text: "Aparelho", cls: "bg-warning/15 text-[#D97706]" },
  outros: { text: "Outros", cls: "bg-muted text-muted-foreground" },
};

const ALL = "__all__";

function CRMPage() {
  const qc = useQueryClient();
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterMedia, setFilterMedia] = useState(ALL);
  const [filterOrigin, setFilterOrigin] = useState(ALL);
  const [filterService, setFilterService] = useState(ALL);
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);

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

  const { data: options } = useQuery({
    queryKey: ["field_options"],
    queryFn: async () => {
      const { data } = await supabase
        .from("field_options")
        .select("field_key,value")
        .order("sort_order");
      const midia = (data ?? []).filter((o) => o.field_key === "midia").map((o) => o.value);
      const origem = (data ?? []).filter((o) => o.field_key === "origem").map((o) => o.value);
      return { midia, origem };
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

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (q && !l.name.toLowerCase().includes(q) && !(l.phone ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (filterMedia !== ALL && l.media !== filterMedia) return false;
      if (filterOrigin !== ALL && l.origin !== filterOrigin) return false;
      if (filterService !== ALL && l.service !== filterService) return false;
      if (onlyUrgent && !l.urgent) return false;
      if (onlyOverdue && !isOverdue(l)) return false;
      return true;
    });
  }, [leads, search, filterMedia, filterOrigin, filterService, onlyUrgent, onlyOverdue]);

  const hasActiveFilters =
    !!search ||
    filterMedia !== ALL ||
    filterOrigin !== ALL ||
    filterService !== ALL ||
    onlyUrgent ||
    onlyOverdue;

  function clearFilters() {
    setSearch("");
    setFilterMedia(ALL);
    setFilterOrigin(ALL);
    setFilterService(ALL);
    setOnlyUrgent(false);
    setOnlyOverdue(false);
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 h-[calc(100dvh-3.5rem-4rem)] lg:h-screen flex flex-col">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Funil de vendas</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Lead
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="pl-8 h-9"
          />
        </div>
        <Select value={filterMedia} onValueChange={setFilterMedia}>
          <SelectTrigger className="h-9 w-auto min-w-[130px]">
            <SelectValue placeholder="Mídia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as mídias</SelectItem>
            {(options?.midia ?? []).map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterOrigin} onValueChange={setFilterOrigin}>
          <SelectTrigger className="h-9 w-auto min-w-[130px]">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as origens</SelectItem>
            {(options?.origem ?? []).map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterService} onValueChange={setFilterService}>
          <SelectTrigger className="h-9 w-auto min-w-[120px]">
            <SelectValue placeholder="Serviço" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os serviços</SelectItem>
            <SelectItem value="implante">Implante</SelectItem>
            <SelectItem value="aparelho">Aparelho</SelectItem>
            <SelectItem value="outros">Outros</SelectItem>
          </SelectContent>
        </Select>
        <button
          onClick={() => setOnlyUrgent((v) => !v)}
          className={cn(
            "text-xs px-3 h-9 rounded-md border font-medium transition-colors",
            onlyUrgent
              ? "bg-purple/15 border-purple text-[#7C3AED]"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Urgentes
        </button>
        <button
          onClick={() => setOnlyOverdue((v) => !v)}
          className={cn(
            "text-xs px-3 h-9 rounded-md border font-medium transition-colors",
            onlyOverdue
              ? "bg-destructive/15 border-destructive text-destructive"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Atrasados
        </button>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs px-2 h-9 rounded-md text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" /> Limpar
          </button>
        )}
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 h-full min-w-max pb-2">
          {COLUMNS.map((col) => {
            const items = filteredLeads.filter((l) => l.stage === col.id);
            return (
              <div
                key={col.id}
                className="w-72 shrink-0 flex flex-col bg-card border border-border rounded-xl shadow-sm"
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
                  {items.map((lead) => {
                    const overdue = isOverdue(lead);
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={() => onDragStart(lead.id)}
                        onClick={() => setOpenLead(lead)}
                        className={cn(
                          "bg-background border rounded-lg p-3 cursor-pointer transition-colors",
                          overdue
                            ? "border-destructive/60 hover:border-destructive"
                            : "border-border hover:border-primary/50",
                          draggingId === lead.id && "opacity-50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-sm truncate">{lead.name}</h4>
                          <div className="flex items-center gap-1 shrink-0">
                            {overdue && (
                              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">
                                <AlertTriangle className="h-3 w-3" /> Atrasado
                              </span>
                            )}
                            {lead.urgent && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple/15 text-[#7C3AED] font-medium">
                                Urgente
                              </span>
                            )}
                          </div>
                        </div>
                        {lead.phone && (
                          <p className="text-xs text-muted-foreground mt-1">{lead.phone}</p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {lead.media && (
                            <Tag text={lead.media} cls="bg-secondary text-foreground" />
                          )}
                          {lead.origin && (
                            <Tag text={lead.origin} cls="bg-success/15 text-[#16A34A]" />
                          )}
                          <Tag {...SERVICE_LABEL[lead.service]} />
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(lead.entry_date).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {lead.budget_amount && (
                            <span className="text-xs font-semibold text-primary">
                              {formatBRL(Number(lead.budget_amount))}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
  return <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", cls)}>{text}</span>;
}
