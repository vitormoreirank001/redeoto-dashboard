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
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, AlertTriangle, Search, SlidersHorizontal, X } from "lucide-react";
import { LeadModal } from "@/components/lead-modal";
import { LeadDetailDialog } from "@/components/lead-detail-dialog";
import { toast } from "sonner";
import {
  formatBRL,
  saleDay,
  type DateBasis,
  type Period,
  PERIOD_LABEL,
  periodRange,
} from "@/lib/date-ranges";
import { cn } from "@/lib/utils";
import { isAwaitingReply, leadUrgencyTone } from "@/lib/lead-sla";
import type { Json } from "@/integrations/supabase/types";
import { useLeads } from "@/hooks/use-leads";
import { PageContainer } from "@/components/page-container";
import { useIsMobile } from "@/hooks/use-mobile";

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
  phone_e164: string | null;
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
  // Guarda-chuva pra campos personalizados (custom_fields) e pros campos novos
  // do painel do Kommo que ainda não têm coluna própria (CPF, nascimento,
  // unidade, usuário responsável, histórico de agendamentos/vendas/visitas) —
  // ficam aqui até a migration ser aprovada, sem quebrar nada hoje.
  custom_data: Record<string, Json>;
  updated_at: string;
  stage_changed_at: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  confirmation_status: "confirmado" | "remarcar" | null;
  chat_closed_at: string | null;
}

export const COLUMNS = [
  { id: "novo", title: "Novo Lead" },
  { id: "contato", title: "Em Atendimento" },
  { id: "agendado", title: "Agendado" },
  { id: "nao_compareceu", title: "Não compareceu" },
  { id: "orcamento", title: "Em Orçamento" },
  { id: "followup", title: "Follow-up Ativo" },
  { id: "fechado", title: "Fechado" },
  { id: "perdido", title: "Perdido" },
] as const;

// service virou texto livre (era 3 opções fixas) — mantém a cor pras 3
// legadas e cai num tom neutro pra qualquer nome novo que a equipe digitar.
const SERVICE_LABEL: Record<string, { text: string; cls: string }> = {
  implante: { text: "Implante", cls: "bg-primary/15 text-primary" },
  aparelho: { text: "Aparelho", cls: "bg-warning/15 text-warning" },
  outros: { text: "Outros", cls: "bg-muted text-muted-foreground" },
};

function serviceTag(service: string) {
  return SERVICE_LABEL[service] ?? { text: service || "—", cls: "bg-muted text-muted-foreground" };
}

const ALL = "__all__";

function CRMPage() {
  const qc = useQueryClient();
  const { lead: deepLinkedLeadId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Board de arrastar-e-soltar não cabe na tela do celular (colunas de 288px
  // ficam cortadas) — abaixo do breakpoint do sidebar fixo (lg, mesmo corte do
  // AppShell) troca pro board de chips de etapa + lista vertical em MobileLeadList.
  // Desktop não muda em nada.
  const isMobile = useIsMobile(1024);
  const [mobileStage, setMobileStage] = useState<string>("novo");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterMedia, setFilterMedia] = useState(ALL);
  const [filterOrigin, setFilterOrigin] = useState(ALL);
  const [filterService, setFilterService] = useState(ALL);
  const [filterUnit, setFilterUnit] = useState(ALL);
  const [selectedStages, setSelectedStages] = useState<string[]>(() => COLUMNS.map((c) => c.id));
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [onlyAwaitingReply, setOnlyAwaitingReply] = useState(false);
  const [period, setPeriod] = useState<Period>("all");
  const [dateBasis, setDateBasis] = useState<DateBasis>("entry");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: leads = [] } = useLeads();
  // Deriva do id em vez de guardar o objeto Lead direto — sem isso, o painel
  // aberto ficava com uma foto congelada do lead no instante do clique, sem
  // refletir os saves inline (mesmo padrão já usado pro `selected` do Chat).
  const openLead = useMemo(
    () => leads.find((l) => l.id === openLeadId) ?? null,
    [leads, openLeadId],
  );

  // Serviço é texto livre — o filtro lista o que a equipe já digitou, em vez
  // de opções fixas de um único nicho (implante/aparelho não fazem sentido
  // pra qualquer negócio que use o sistema).
  const serviceOptions = useMemo(
    () =>
      Array.from(new Set(leads.map((l) => l.service).filter((s): s is string => !!s?.trim()))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [leads],
  );

  // Deep link vindo da fila "Contate agora" do Home (?lead=<id>): abre o modal
  // direto e limpa o parâmetro pra não reabrir se a pessoa navegar de volta.
  useEffect(() => {
    if (!deepLinkedLeadId || leads.length === 0) return;
    const found = leads.find((l) => l.id === deepLinkedLeadId);
    if (found) {
      setOpenLeadId(found.id);
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
      const unidade = (data ?? []).filter((o) => o.field_key === "unidade").map((o) => o.value);
      return { midia, origem, unidade };
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
      period === "custom"
        ? { from: customFrom || null, to: customTo || null }
        : periodRange(period);

    return leads.filter((l) => {
      if (q && !l.name.toLowerCase().includes(q) && !(l.phone ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (filterMedia !== ALL && l.media !== filterMedia) return false;
      if (filterOrigin !== ALL && l.origin !== filterOrigin) return false;
      if (filterService !== ALL && l.service !== filterService) return false;
      if (filterUnit !== ALL && (l.custom_data?.unidade as string | undefined) !== filterUnit) {
        return false;
      }
      if (!selectedStages.includes(l.stage)) return false;
      if (onlyUrgent && !l.urgent) return false;
      if (onlyAwaitingReply && !isAwaitingReply(l)) return false;

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
    filterUnit,
    selectedStages,
    onlyUrgent,
    onlyAwaitingReply,
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

  const activeFilterCount = [
    filterMedia !== ALL,
    filterOrigin !== ALL,
    filterService !== ALL,
    filterUnit !== ALL,
    selectedStages.length !== COLUMNS.length,
    onlyUrgent,
    onlyAwaitingReply,
    period !== "all",
  ].filter(Boolean).length;

  const hasActiveFilters = !!search || activeFilterCount > 0;

  function clearFilters() {
    setSearch("");
    setFilterMedia(ALL);
    setFilterOrigin(ALL);
    setFilterService(ALL);
    setFilterUnit(ALL);
    setSelectedStages(COLUMNS.map((c) => c.id));
    setOnlyUrgent(false);
    setOnlyAwaitingReply(false);
    setPeriod("all");
    setDateBasis("entry");
    setCustomFrom("");
    setCustomTo("");
  }

  function toggleStage(stageId: string) {
    setSelectedStages((prev) =>
      prev.includes(stageId) ? prev.filter((s) => s !== stageId) : [...prev, stageId],
    );
  }

  return (
    <PageContainer
      bleed
      className="space-y-4 h-[calc(100dvh-3.5rem-4rem)] lg:h-screen flex flex-col"
    >
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

        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-9 gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Propriedades do lead</SheetTitle>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Data</label>
                <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Todo período" />
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
                    <SelectTrigger className="h-9 w-full">
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
                      className="h-9"
                      aria-label="Data inicial"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">até</span>
                    <Input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-9"
                      aria-label="Data final"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Etapas ativas</label>
                <div className="border border-border rounded-lg p-2.5 space-y-2">
                  {COLUMNS.map((col) => (
                    <label key={col.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedStages.includes(col.id)}
                        onCheckedChange={() => toggleStage(col.id)}
                      />
                      {col.title}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Mídia</label>
                <Select value={filterMedia} onValueChange={setFilterMedia}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Todas as mídias" />
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
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Origem</label>
                <Select value={filterOrigin} onValueChange={setFilterOrigin}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Todas as origens" />
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
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Serviço</label>
                <Select value={filterService} onValueChange={setFilterService}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Todos os serviços" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos os serviços</SelectItem>
                    {serviceOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SERVICE_LABEL[s]?.text ?? s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Unidade</label>
                <Select value={filterUnit} onValueChange={setFilterUnit}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Todas as unidades" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as unidades</SelectItem>
                    {(options?.unidade ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 pt-3 border-t border-border">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={onlyUrgent} onCheckedChange={(v) => setOnlyUrgent(!!v)} />
                  Só urgentes
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={onlyAwaitingReply}
                    onCheckedChange={(v) => setOnlyAwaitingReply(!!v)}
                  />
                  Só sem resposta
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-2 pt-4 border-t border-border">
              <button
                onClick={clearFilters}
                className="text-xs px-2 h-9 rounded-md text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" /> Limpar filtros
              </button>
              <Button size="sm" onClick={() => setFiltersOpen(false)}>
                Aplicar
              </Button>
            </div>
          </SheetContent>
        </Sheet>

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

      {isMobile ? (
        <MobileLeadList
          leads={filteredLeads}
          activeStage={mobileStage}
          onStageChange={setMobileStage}
          onOpen={(lead) => setOpenLeadId(lead.id)}
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-4 h-full min-w-max pb-2">
              {COLUMNS.map((col) => {
                const items = filteredLeads.filter((l) => l.stage === col.id);
                return (
                  <KanbanColumn
                    key={col.id}
                    col={col}
                    items={items}
                    onOpen={(lead) => setOpenLeadId(lead.id)}
                  />
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
      )}

      {creating && (
        <LeadModal
          lead={null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            toast.success("Lead salvo");
            qc.invalidateQueries({ queryKey: ["leads"] });
          }}
        />
      )}

      {openLead && <LeadDetailDialog lead={openLead} onClose={() => setOpenLeadId(null)} />}
    </PageContainer>
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
        <h3 className="text-sm font-semibold flex items-center gap-2">{col.title}</h3>
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

const TEMPERATURE_BAR: Record<"urgent" | "cooling", string> = {
  urgent: "before:bg-primary",
  cooling: "before:bg-frio",
};

function KanbanCard({ lead, onOpen }: { lead: Lead; onOpen: (lead: Lead) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
  });
  const awaitingReply = isAwaitingReply(lead);
  const tone = leadUrgencyTone(lead);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(lead)}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "relative bg-background border rounded-lg p-3 pl-4 cursor-pointer transition-colors touch-none",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-lg",
        tone ? TEMPERATURE_BAR[tone] : "before:bg-transparent",
        awaitingReply
          ? "border-destructive/60 hover:border-destructive"
          : "border-border hover:border-primary/50",
        isDragging && "opacity-40",
      )}
    >
      <LeadCardBody lead={lead} />
    </div>
  );
}

/**
 * Alternativa ao board de arrastar-e-soltar pro celular — 8 colunas de 288px
 * lado a lado não cabem numa tela de ~380px, sobrava só uma lasca da coluna
 * seguinte (reportado pelo Vitor com print do CRM no iPhone). Em vez de
 * arrastar (gesto ruim em tela pequena), escolhe a etapa por chip e move o
 * lead pelo seletor de etapa que já existe no topo do painel do lead
 * (lead-panel.tsx) — mesma troca de etapa, sem precisar de drag.
 */
function MobileLeadList({
  leads,
  activeStage,
  onStageChange,
  onOpen,
}: {
  leads: Lead[];
  activeStage: string;
  onStageChange: (stage: string) => void;
  onOpen: (lead: Lead) => void;
}) {
  const items = leads.filter((l) => l.stage === activeStage);
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-0 sm:px-0">
        {COLUMNS.map((col) => {
          const count = leads.filter((l) => l.stage === col.id).length;
          const active = col.id === activeStage;
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => onStageChange(col.id)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-medium border transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border",
              )}
            >
              {col.title}
              <span
                className={cn(
                  "min-w-4 px-1 rounded-full text-[10px] leading-4",
                  active ? "bg-primary-foreground/20" : "bg-secondary",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pt-1 pb-4">
        {items.map((lead) => {
          const awaitingReply = isAwaitingReply(lead);
          const tone = leadUrgencyTone(lead);
          return (
            <div
              key={lead.id}
              onClick={() => onOpen(lead)}
              className={cn(
                "relative bg-background border rounded-lg p-3 pl-4 cursor-pointer",
                "before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-lg",
                tone ? TEMPERATURE_BAR[tone] : "before:bg-transparent",
                awaitingReply ? "border-destructive/60" : "border-border",
              )}
            >
              <LeadCardBody lead={lead} />
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="text-center py-10 text-sm text-muted-foreground/60">
            Sem leads nesta etapa
          </div>
        )}
      </div>
    </div>
  );
}

function LeadCardBody({ lead }: { lead: Lead }) {
  const awaitingReply = isAwaitingReply(lead);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-sm truncate">{lead.name}</h4>
        <div className="flex items-center gap-1 shrink-0">
          {awaitingReply && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">
              <AlertTriangle className="h-3 w-3" />
              Sem resposta
            </span>
          )}
          {lead.urgent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple/15 text-purple font-medium">
              Urgente
            </span>
          )}
        </div>
      </div>
      {lead.phone && <p className="text-xs text-muted-foreground mt-1">{lead.phone}</p>}
      <div className="flex flex-wrap gap-1 mt-2">
        {lead.media && <Tag text={lead.media} cls="bg-secondary text-foreground" />}
        {lead.origin && <Tag text={lead.origin} cls="bg-success/15 text-success" />}
        <Tag {...serviceTag(lead.service)} />
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
