import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
import { formatBRL, saleDay } from "@/lib/date-ranges";
import { cn } from "@/lib/utils";
import { isOverdue, overdueFollowupStep } from "@/lib/lead-sla";

export const Route = createFileRoute("/_authenticated/crm")({
  component: CRMPage,
  validateSearch: (search: Record<string, unknown>): { lead?: string } => ({
    lead: typeof search.lead === "string" ? search.lead : undefined,
  }),
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
  closed_at: string | null;
  appointment_date: string | null;
  financing: string | null;
  checklist: Record<string, boolean>;
  notes: string | null;
  history: Array<{ at: string; text: string }>;
  calls: Array<{ at: string; answered: boolean }>;
  custom_data: Record<string, string | number | boolean | null>;
  updated_at: string;
  stage_changed_at: string;
}

export const COLUMNS = [
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

/** Qual data o filtro de período considera. */
type DateBasis = "entry" | "sale";

type Period = "all" | "today" | "7d" | "30d" | "month" | "lastmonth" | "custom";

const PERIOD_LABEL: Record<Exclude<Period, "custom">, string> = {
  all: "Todo o período",
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Este mês",
  lastmonth: "Mês passado",
};

function iso(d: Date): string {
  // Data local (não UTC) — toISOString() joga pro dia anterior no fuso do Brasil.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Faixa [from, to] inclusiva em YYYY-MM-DD. `null` = sem limite daquele lado. */
function periodRange(p: Period): { from: string | null; to: string | null } {
  const now = new Date();
  const today = iso(now);
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { from: iso(d), to: today };
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: iso(d), to: today };
    }
    case "month":
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case "lastmonth":
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    default:
      return { from: null, to: null };
  }
}

function CRMPage() {
  const qc = useQueryClient();
  const { lead: deepLinkedLeadId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterMedia, setFilterMedia] = useState(ALL);
  const [filterOrigin, setFilterOrigin] = useState(ALL);
  const [filterService, setFilterService] = useState(ALL);
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [period, setPeriod] = useState<Period>("all");
  const [dateBasis, setDateBasis] = useState<DateBasis>("entry");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

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

  // Deep link vindo da fila "Contate agora" do Home (?lead=<id>): abre o modal
  // direto e limpa o parâmetro pra não reabrir se a pessoa navegar de volta.
  useEffect(() => {
    if (!deepLinkedLeadId || leads.length === 0) return;
    const found = leads.find((l) => l.id === deepLinkedLeadId);
    if (found) {
      setOpenLead(found);
      navigate({ search: {}, replace: true });
    }
  }, [deepLinkedLeadId, leads, navigate]);

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
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const previous = qc.getQueryData<Lead[]>(["leads"]);
      qc.setQueryData<Lead[]>(
        ["leads"],
        (old) =>
          old?.map((l) =>
            l.id === id ? { ...l, stage, stage_changed_at: new Date().toISOString() } : l,
          ) ?? old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Reverte pro estado anterior: card já tinha "pulado" de coluna na tela.
      if (context?.previous) qc.setQueryData(["leads"], context.previous);
      toast.error("Não foi possível mover o lead — tente novamente");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Delay em vez de distance no touch: sem isso, o primeiro toque de um scroll
    // de coluna já contaria como início de drag e travaria o scroll no celular.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const stage = event.over?.id;
    if (typeof stage !== "string") return;
    const lead = leads.find((l) => l.id === event.active.id);
    if (lead && lead.stage !== stage) {
      moveStage.mutate({ id: lead.id, stage });
    }
  }

  const activeLead = activeId ? (leads.find((l) => l.id === activeId) ?? null) : null;

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    const { from, to } =
      period === "custom" ? { from: customFrom || null, to: customTo || null } : periodRange(period);

    return leads.filter((l) => {
      if (q && !l.name.toLowerCase().includes(q) && !(l.phone ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (filterMedia !== ALL && l.media !== filterMedia) return false;
      if (filterOrigin !== ALL && l.origin !== filterOrigin) return false;
      if (filterService !== ALL && l.service !== filterService) return false;
      if (onlyUrgent && !l.urgent) return false;
      if (onlyOverdue && !isOverdue(l)) return false;

      if (from || to) {
        // Na base "venda", quem não fechou não tem data e sai do resultado.
        const day =
          dateBasis === "sale"
            ? l.stage === "fechado"
              ? saleDay(l)
              : null
            : l.entry_date.slice(0, 10);
        if (!day) return false;
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      return true;
    });
  }, [
    leads,
    search,
    filterMedia,
    filterOrigin,
    filterService,
    onlyUrgent,
    onlyOverdue,
    period,
    dateBasis,
    customFrom,
    customTo,
  ]);

  /** Total fechado dentro do filtro atual — confere direto com o DRE. */
  const filteredRevenue = useMemo(
    () =>
      filteredLeads
        .filter((l) => l.stage === "fechado")
        .reduce((a, l) => a + Number(l.budget_amount || 0), 0),
    [filteredLeads],
  );

  const hasActiveFilters =
    !!search ||
    filterMedia !== ALL ||
    filterOrigin !== ALL ||
    filterService !== ALL ||
    onlyUrgent ||
    onlyOverdue ||
    period !== "all";

  function clearFilters() {
    setSearch("");
    setFilterMedia(ALL);
    setFilterOrigin(ALL);
    setFilterService(ALL);
    setOnlyUrgent(false);
    setOnlyOverdue(false);
    setPeriod("all");
    setDateBasis("entry");
    setCustomFrom("");
    setCustomTo("");
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
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="h-9 w-auto min-w-[140px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABEL) as Array<keyof typeof PERIOD_LABEL>).map((p) => (
              <SelectItem key={p} value={p}>
                {PERIOD_LABEL[p]}
              </SelectItem>
            ))}
            <SelectItem value="custom">Personalizado…</SelectItem>
          </SelectContent>
        </Select>
        {period !== "all" && (
          <Select value={dateBasis} onValueChange={(v) => setDateBasis(v as DateBasis)}>
            <SelectTrigger className="h-9 w-auto min-w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entry">por data de entrada</SelectItem>
              <SelectItem value="sale">por data da venda</SelectItem>
            </SelectContent>
          </Select>
        )}
        {period === "custom" && (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 w-auto"
              aria-label="Data inicial"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 w-auto"
              aria-label="Data final"
            />
          </div>
        )}
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

      {hasActiveFilters && (
        <div className="text-xs text-muted-foreground -mt-1">
          {filteredLeads.length} {filteredLeads.length === 1 ? "lead" : "leads"} no filtro ·{" "}
          <span className="font-semibold text-primary">{formatBRL(filteredRevenue)}</span> fechado
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-4 h-full min-w-max pb-2">
            {COLUMNS.map((col) => {
              const items = filteredLeads.filter((l) => l.stage === col.id);
              return (
                <KanbanColumn key={col.id} col={col} items={items} onOpen={setOpenLead} />
              );
            })}
          </div>
        </div>
        <DragOverlay>
          {activeLead && (
            <div className="w-72 bg-background border border-primary rounded-lg p-3 shadow-lg">
              <LeadCardBody lead={activeLead} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

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

function KanbanColumn({
  col,
  items,
  onOpen,
}: {
  col: (typeof COLUMNS)[number];
  items: Lead[];
  onOpen: (lead: Lead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-72 shrink-0 flex flex-col bg-card border rounded-xl shadow-sm transition-colors",
        isOver ? "border-primary/60 bg-primary/5" : "border-border",
      )}
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
          <KanbanCard key={lead.id} lead={lead} onOpen={onOpen} />
        ))}
        {items.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground/60">Sem leads</div>
        )}
      </div>
    </div>
  );
}

function KanbanCard({ lead, onOpen }: { lead: Lead; onOpen: (lead: Lead) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
  });
  const overdue = isOverdue(lead);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(lead)}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "bg-background border rounded-lg p-3 cursor-pointer transition-colors touch-none",
        overdue ? "border-destructive/60 hover:border-destructive" : "border-border hover:border-primary/50",
        isDragging && "opacity-40",
      )}
    >
      <LeadCardBody lead={lead} />
    </div>
  );
}

function LeadCardBody({ lead }: { lead: Lead }) {
  const overdue = isOverdue(lead);
  const followupStep = overdueFollowupStep(lead);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-sm truncate">{lead.name}</h4>
        <div className="flex items-center gap-1 shrink-0">
          {overdue && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">
              <AlertTriangle className="h-3 w-3" />
              {followupStep ? `Follow-up ${followupStep.label}` : "Atrasado"}
            </span>
          )}
          {lead.urgent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple/15 text-[#7C3AED] font-medium">
              Urgente
            </span>
          )}
        </div>
      </div>
      {lead.phone && <p className="text-xs text-muted-foreground mt-1">{lead.phone}</p>}
      <div className="flex flex-wrap gap-1 mt-2">
        {lead.media && <Tag text={lead.media} cls="bg-secondary text-foreground" />}
        {lead.origin && <Tag text={lead.origin} cls="bg-success/15 text-[#16A34A]" />}
        <Tag {...SERVICE_LABEL[lead.service]} />
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
        <span className="text-[11px] text-muted-foreground">
          {lead.stage === "fechado" && lead.closed_at
            ? `Venda ${new Date(lead.closed_at).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}`
            : new Date(lead.entry_date).toLocaleString("pt-BR", {
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
    </>
  );
}
