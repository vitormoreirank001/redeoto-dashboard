import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Pencil, Plus, Trash2 } from "lucide-react";
import { formatBRL } from "@/lib/date-ranges";
import {
  LeadModal,
  waLink,
  groupCustomFields,
  slug,
  type CustomField,
} from "@/components/lead-modal";
import type { Lead } from "@/routes/_authenticated/crm";
import { COLUMNS } from "@/routes/_authenticated/crm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LEADS_QUERY_KEY } from "@/hooks/use-leads";
import { useMessages } from "@/hooks/use-messages";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Database, Json } from "@/integrations/supabase/types";

type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

// Uma cor por etapa (referência: seletor colorido de funil do Kommo) — cada
// cor tem sentido: frio = ainda não engajado, âmbar = em andamento, verde =
// resultado bom, vermelho = problema ativo, cinza = etapa morta (perdido).
const STAGE_COLOR: Record<string, string> = {
  novo: "bg-frio/15 text-frio border-frio/30",
  contato: "bg-warning/15 text-warning border-warning/30",
  agendado: "bg-success/15 text-success border-success/30",
  nao_compareceu: "bg-destructive/15 text-destructive border-destructive/30",
  orcamento: "bg-primary/15 text-primary border-primary/30",
  followup: "bg-morno/15 text-morno border-morno/30",
  fechado: "bg-success/20 text-success border-success/40",
  perdido: "bg-muted text-muted-foreground border-border",
};

const PATIENT_TYPE_LABEL: Record<string, string> = {
  novo: "Novo",
  retorno: "Retorno",
  recorrencia: "Recorrência",
};

/**
 * Campos abaixo (Usuário responsável, Unidade, CPF, Nascimento, tipo de
 * paciente, histórico de agendamentos/visitas/vendas) foram pedidos iguais ao
 * Kommo mas ainda NÃO têm coluna própria no banco — combinado com o Vitor que
 * fica tudo dentro de `leads.custom_data` (jsonb que já existe) até ele
 * aprovar a migration de verdade (colunas tipadas + tabelas de histórico).
 * Ver a seção "Fase seguinte" no plano da V5.0 pros detalhes da migration.
 */
interface AppointmentEntry {
  at: string;
  patient_type: string;
}
interface SaleEntry {
  at: string;
  amount: number;
  responsible: string;
}
interface VisitEntry {
  at: string;
  budget_amount: number;
  attachment_note: string;
}

/** `custom_data` (e os arrays novos: agendamentos/vendas/visitas) é tipado
 * como Json no schema gerado do Supabase — essas duas funções isolam num só
 * lugar a conversão entre os shapes concretos que usamos aqui e Json. */
function asJson<T>(value: T): Json {
  return value as unknown as Json;
}
function fromJson<T>(value: Json | undefined): T | undefined {
  return value as unknown as T | undefined;
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocal(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromDatetimeLocal(value: string) {
  return new Date(value).toISOString();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">
        {title}
      </h3>
      <div>{children}</div>
    </div>
  );
}

/** Linha só de leitura — usada na aba API (valores calculados). */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right truncate min-w-0">{value ?? "···"}</span>
    </div>
  );
}

const inlineInputCls =
  "text-right bg-transparent border-0 outline-none focus:ring-0 text-sm min-w-0 flex-1 placeholder:text-muted-foreground/50";
const miniInputCls = "h-7 text-xs border border-border rounded px-1.5 bg-background";

/** Campo editável direto no lugar (sem precisar abrir modal) — salva ao sair do campo. */
function EditableField({
  label,
  value,
  onSave,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: "text" | "number" | "date" | "datetime-local";
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onSave(draft);
        }}
        placeholder={placeholder}
        className={inlineInputCls}
      />
    </div>
  );
}

function EditableSelect({
  label,
  value,
  onSave,
  options,
  placeholder = "···",
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <Select value={value || undefined} onValueChange={onSave}>
        <SelectTrigger className="h-7 w-auto max-w-[65%] border-0 shadow-none bg-transparent px-0 justify-end gap-1 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NotesField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      placeholder="Notas gerais sobre o lead..."
      className="text-sm min-h-[70px]"
    />
  );
}

function NewAppointmentForm({ onAdd }: { onAdd: (e: AppointmentEntry) => void }) {
  const [at, setAt] = useState(() => toDatetimeLocal());
  const [patientType, setPatientType] = useState("novo");
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <input
        type="datetime-local"
        value={at}
        onChange={(e) => setAt(e.target.value)}
        className={miniInputCls}
      />
      <Select value={patientType} onValueChange={setPatientType}>
        <SelectTrigger className="h-7 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="novo">Novo</SelectItem>
          <SelectItem value="retorno">Retorno</SelectItem>
          <SelectItem value="recorrencia">Recorrência</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-7 text-xs px-2"
        onClick={() => {
          onAdd({ at: fromDatetimeLocal(at), patient_type: patientType });
          setAt(toDatetimeLocal());
        }}
      >
        <Plus className="h-3 w-3 mr-1" /> Registrar
      </Button>
    </div>
  );
}

function NewVisitForm({ onAdd }: { onAdd: (e: VisitEntry) => void }) {
  const [at, setAt] = useState(() => toDatetimeLocal());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="datetime-local"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          className={miniInputCls}
        />
        <input
          type="number"
          placeholder="Valor do orçamento"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={cn(miniInputCls, "w-36")}
        />
      </div>
      <input
        placeholder="Anexo (link/observação — upload real depende de bucket de storage)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className={cn(miniInputCls, "w-full")}
      />
      <Button
        size="sm"
        className="h-7 text-xs px-2"
        onClick={() => {
          onAdd({
            at: fromDatetimeLocal(at),
            budget_amount: Number(amount) || 0,
            attachment_note: note,
          });
          setAmount("");
          setNote("");
        }}
      >
        <Plus className="h-3 w-3 mr-1" /> Registrar visita
      </Button>
    </div>
  );
}

function NewSaleForm({ onAdd }: { onAdd: (e: SaleEntry) => void }) {
  const [at, setAt] = useState(() => toDatetimeLocal());
  const [amount, setAmount] = useState("");
  const [responsible, setResponsible] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <input
        type="datetime-local"
        value={at}
        onChange={(e) => setAt(e.target.value)}
        className={miniInputCls}
      />
      <input
        type="number"
        placeholder="Valor"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className={cn(miniInputCls, "w-24")}
      />
      <input
        placeholder="Responsável"
        value={responsible}
        onChange={(e) => setResponsible(e.target.value)}
        className={cn(miniInputCls, "w-28")}
      />
      <Button
        size="sm"
        className="h-7 text-xs px-2"
        disabled={!amount}
        onClick={() => {
          onAdd({ at: fromDatetimeLocal(at), amount: Number(amount) || 0, responsible });
          setAmount("");
          setResponsible("");
        }}
      >
        <Plus className="h-3 w-3 mr-1" /> Cadastrar
      </Button>
    </div>
  );
}

function NewCallForm({ onAdd }: { onAdd: (e: { at: string; answered: boolean }) => void }) {
  const [at, setAt] = useState(() => toDatetimeLocal());
  const [answered, setAnswered] = useState<"sim" | "nao">("sim");
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <Select value={answered} onValueChange={(v) => setAnswered(v as "sim" | "nao")}>
        <SelectTrigger className="h-7 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="sim">Atendida</SelectItem>
          <SelectItem value="nao">Não atendida</SelectItem>
        </SelectContent>
      </Select>
      <input
        type="datetime-local"
        value={at}
        onChange={(e) => setAt(e.target.value)}
        className={miniInputCls}
      />
      <Button
        size="sm"
        className="h-7 text-xs px-2"
        onClick={() => {
          onAdd({ at: fromDatetimeLocal(at), answered: answered === "sim" });
          setAt(toDatetimeLocal());
        }}
      >
        <Plus className="h-3 w-3 mr-1" /> Registrar
      </Button>
    </div>
  );
}

function customFieldValueLabel(cf: CustomField, raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (cf.field_type === "boolean") return raw ? "Sim" : "Não";
  return String(raw);
}

/**
 * Painel do lead (coluna do meio no Chat) — abas iguais ao Kommo (Principal /
 * Contato / Marketing / Agendamento / Visitas / Vendas / Ligações / API +
 * um grupo por campo personalizado), tudo editável direto aqui (sem precisar
 * do lápis). Etapa também muda direto pelo seletor colorido do topo.
 */
export function LeadPanel({ lead }: { lead: Lead }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();

  const updateLead = useMutation({
    mutationFn: async (patch: Record<string, Json>) => {
      // supabase-js exige um shape literal (não um Record genérico) pro
      // update — o contrato de tipo real já foi garantido acima por Json.
      const { error } = await supabase
        .from("leads")
        .update(patch as unknown as LeadUpdate)
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LEADS_QUERY_KEY }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao salvar"),
  });

  function save(patch: Record<string, Json>) {
    updateLead.mutate(patch);
  }
  function saveCustom(partial: Record<string, Json>) {
    updateLead.mutate({ custom_data: { ...(lead.custom_data ?? {}), ...partial } });
  }

  const { data: customFields = [] } = useQuery({
    queryKey: ["custom_fields"],
    queryFn: async () => {
      const { data } = await supabase
        .from("custom_fields")
        .select("key,label,field_type,options,group_name")
        .order("group_name")
        .order("sort_order");
      return (data ?? []) as CustomField[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles_list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").order("full_name");
      return data ?? [];
    },
  });

  // Mesma queryKey/consulta já usada em crm.tsx e lead-modal.tsx — cache
  // compartilhado. "unidade" reaproveita o mecanismo genérico de opções que
  // já existe pra Mídia/Origem (ver Configurações).
  const { data: fieldOptions } = useQuery({
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

  // Reaproveita a mesma queryKey que a thread do Chat já busca pra esse lead
  // — react-query dedupe, não dispara requisição extra.
  const { data: messages = [] } = useMessages(lead.id);

  const cd = lead.custom_data ?? {};
  const appointments = fromJson<AppointmentEntry[]>(cd.appointments) ?? [];
  const sales = fromJson<SaleEntry[]>(cd.sales) ?? [];
  const visits = fromJson<VisitEntry[]>(cd.visits) ?? [];

  const firstMessageAt = messages.length > 0 ? messages[0].created_at : null;
  const lastAppointmentAt = appointments[0]?.at ?? lead.appointment_date;
  const appointmentsCount =
    appointments.length > 0 ? appointments.length : lead.appointment_date ? 1 : 0;
  const salesCount = sales.length > 0 ? sales.length : lead.stage === "fechado" ? 1 : 0;
  const totalReceived =
    sales.length > 0
      ? sales.reduce((a, s) => a + Number(s.amount || 0), 0)
      : lead.stage === "fechado"
        ? Number(lead.budget_amount || 0)
        : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border shrink-0 flex items-center gap-2">
        <Select value={lead.stage} onValueChange={(v) => save({ stage: v })}>
          <SelectTrigger
            className={cn(
              "h-8 flex-1 min-w-0 text-xs font-medium border",
              STAGE_COLOR[lead.stage] ?? "bg-secondary text-muted-foreground",
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLUMNS.map((c) => (
              <SelectItem
                key={c.id}
                value={c.id}
                className={cn("text-xs font-medium my-0.5 rounded", STAGE_COLOR[c.id])}
              >
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          title="Excluir lead"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Tabs defaultValue="principal" className="flex-1 min-h-0 flex flex-col">
        <TabsList className="mx-3 mt-2 w-auto shrink-0 flex-wrap h-auto justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="principal">Principal</TabsTrigger>
          <TabsTrigger value="contato">Contato</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
          <TabsTrigger value="agendamento">Agendamento</TabsTrigger>
          <TabsTrigger value="visitas">Visitas</TabsTrigger>
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="ligacoes">Ligações</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          {groupCustomFields(customFields).map(([groupName]) => (
            <TabsTrigger key={groupName} value={slug(groupName)}>
              {groupName}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="principal" className="flex-1 overflow-y-auto p-3 space-y-4 mt-0">
          {lead.phone_e164 && (
            <a
              href={waLink(lead.phone_e164)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg bg-success/15 text-success px-3 py-2 text-sm hover:bg-success/25 transition-colors"
            >
              <Phone className="h-4 w-4" />
              {lead.phone}
            </a>
          )}
          <div>
            <EditableSelect
              label="Usuário responsável"
              value={(cd.assigned_user_id as string) ?? ""}
              onSave={(v) => saveCustom({ assigned_user_id: v })}
              options={profiles.map((p) => ({ value: p.id, label: p.full_name || "Sem nome" }))}
              placeholder="Selecione"
            />
            <EditableField
              label={lead.stage === "fechado" ? "Valor fechado" : "Valor do orçamento"}
              value={lead.budget_amount != null ? String(lead.budget_amount) : ""}
              onSave={(v) => save({ budget_amount: v ? Number(v) : null })}
              type="number"
              placeholder="R$"
            />
            <EditableSelect
              label="Unidade"
              value={(cd.unidade as string) ?? ""}
              onSave={(v) => saveCustom({ unidade: v })}
              options={(fieldOptions?.unidade ?? []).map((u) => ({ value: u, label: u }))}
              placeholder="Selecione a unidade"
            />
            <EditableField
              label="Serviço de interesse"
              value={lead.service ?? ""}
              onSave={(v) => save({ service: v })}
            />
            <EditableSelect
              label="Financiamento?"
              value={lead.financing ?? ""}
              onSave={(v) => save({ financing: v })}
              options={[
                { value: "sim", label: "Sim" },
                { value: "nao", label: "Não" },
                { value: "analise", label: "Em análise" },
              ]}
            />
            <div className="flex items-center justify-between gap-3 py-1.5 text-sm border-b border-border/40">
              <span className="text-muted-foreground">Urgente</span>
              <button
                onClick={() => save({ urgent: !lead.urgent })}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium transition-colors",
                  lead.urgent ? "bg-purple/15 text-purple" : "bg-muted text-muted-foreground",
                )}
              >
                {lead.urgent ? "Sim" : "Não"}
              </button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contato" className="flex-1 overflow-y-auto p-3 space-y-4 mt-0">
          <div>
            <EditableField
              label="Nome completo"
              value={lead.name}
              onSave={(v) => v.trim() && save({ name: v.trim() })}
            />
            <EditableField
              label="Telefone"
              value={lead.phone ?? ""}
              onSave={(v) => save({ phone: v || null })}
            />
            <EditableField
              label="CPF"
              value={(cd.cpf as string) ?? ""}
              onSave={(v) => saveCustom({ cpf: v })}
              placeholder="000.000.000-00"
            />
            <EditableField
              label="Data de nascimento"
              value={(cd.birth_date as string) ?? ""}
              onSave={(v) => saveCustom({ birth_date: v })}
              type="date"
            />
          </div>
          <Section title="Observações">
            <NotesField value={lead.notes ?? ""} onSave={(v) => save({ notes: v || null })} />
          </Section>
        </TabsContent>

        <TabsContent value="marketing" className="flex-1 overflow-y-auto p-3 space-y-4 mt-0">
          <div>
            <EditableSelect
              label="Mídia (de onde veio)"
              value={lead.media ?? ""}
              onSave={(v) => save({ media: v })}
              options={(fieldOptions?.midia ?? []).map((m) => ({ value: m, label: m }))}
            />
            <EditableSelect
              label="Origem (como chegou)"
              value={lead.origin ?? ""}
              onSave={(v) => save({ origin: v })}
              options={(fieldOptions?.origem ?? []).map((m) => ({ value: m, label: m }))}
            />
          </div>
        </TabsContent>

        <TabsContent value="agendamento" className="flex-1 overflow-y-auto p-3 space-y-4 mt-0">
          <div>
            <EditableField
              label="Agendado para"
              value={lead.appointment_date ? toDatetimeLocal(lead.appointment_date) : ""}
              onSave={(v) => save({ appointment_date: v ? fromDatetimeLocal(v) : null })}
              type="datetime-local"
            />
          </div>

          <Section title="Histórico de agendamentos">
            <div className="space-y-1.5">
              {appointments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum agendamento registrado ainda.
                </p>
              )}
              {appointments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-secondary/40 rounded-md px-2 py-1.5 text-xs"
                >
                  <span>
                    {fmtDateTime(a.at)} · {PATIENT_TYPE_LABEL[a.patient_type] ?? a.patient_type}
                  </span>
                  <button
                    onClick={() =>
                      saveCustom({
                        appointments: asJson(appointments.filter((_, idx) => idx !== i)),
                      })
                    }
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <NewAppointmentForm
              onAdd={(entry) => saveCustom({ appointments: asJson([entry, ...appointments]) })}
            />
          </Section>
        </TabsContent>

        <TabsContent value="visitas" className="flex-1 overflow-y-auto p-3 space-y-3 mt-0">
          <div className="space-y-1.5">
            {visits.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma visita registrada ainda.</p>
            )}
            {visits.map((v, i) => (
              <div key={i} className="bg-secondary/40 rounded-md px-2 py-1.5 text-xs space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{fmtDateTime(v.at)}</span>
                  <button
                    onClick={() =>
                      saveCustom({ visits: asJson(visits.filter((_, idx) => idx !== i)) })
                    }
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-muted-foreground">
                  Orçamento: {formatBRL(v.budget_amount)}
                  {v.attachment_note ? ` · ${v.attachment_note}` : ""}
                </p>
              </div>
            ))}
          </div>
          <NewVisitForm onAdd={(entry) => saveCustom({ visits: asJson([entry, ...visits]) })} />
        </TabsContent>

        <TabsContent value="vendas" className="flex-1 overflow-y-auto p-3 space-y-3 mt-0">
          <div className="space-y-1.5">
            {sales.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma venda registrada ainda.</p>
            )}
            {sales.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-secondary/40 rounded-md px-2 py-1.5 text-xs"
              >
                <span>
                  {fmtDateTime(s.at)} · {formatBRL(s.amount)}
                  {s.responsible ? ` · ${s.responsible}` : ""}
                </span>
                <button
                  onClick={() => saveCustom({ sales: asJson(sales.filter((_, idx) => idx !== i)) })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <NewSaleForm onAdd={(entry) => saveCustom({ sales: asJson([entry, ...sales]) })} />
        </TabsContent>

        <TabsContent value="ligacoes" className="flex-1 overflow-y-auto p-3 space-y-3 mt-0">
          <div className="space-y-1.5">
            {(lead.calls ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma ligação registrada.</p>
            )}
            {(lead.calls ?? []).map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-secondary/40 rounded-md px-2 py-1.5 text-xs"
              >
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full font-medium",
                    c.answered
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive",
                  )}
                >
                  {c.answered ? "Atendida" : "Não atendida"}
                </span>
                <span className="text-muted-foreground">{fmtDateTime(c.at)}</span>
                <button
                  onClick={() =>
                    save({ calls: asJson((lead.calls ?? []).filter((_, idx) => idx !== i)) })
                  }
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <NewCallForm onAdd={(entry) => save({ calls: asJson([entry, ...(lead.calls ?? [])]) })} />
        </TabsContent>

        <TabsContent value="api" className="flex-1 overflow-y-auto p-3 space-y-1 mt-0">
          <Row label="Criado em" value={fmtDateTime(lead.entry_date)} />
          <Row label="Primeira mensagem enviada" value={fmtDateTime(firstMessageAt)} />
          <Row label="Último agendamento" value={fmtDateTime(lastAppointmentAt)} />
          <Row label="Data da venda" value={fmtDateTime(lead.closed_at)} />
          <Row label="Quantidade de agendamentos" value={String(appointmentsCount)} />
          <Row label="Quantidade de vendas" value={String(salesCount)} />
          <Row label="Valor total recebido (LTV)" value={formatBRL(totalReceived)} />
        </TabsContent>

        {groupCustomFields(customFields).map(([groupName, fields]) => (
          <TabsContent
            key={groupName}
            value={slug(groupName)}
            className="flex-1 overflow-y-auto p-3 space-y-1 mt-0"
          >
            {fields.map((cf) => (
              <Row
                key={cf.key}
                label={cf.label}
                value={customFieldValueLabel(cf, lead.custom_data?.[cf.key])}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {editing && (
        <LeadModal
          lead={lead}
          showChat={false}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            qc.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
          }}
        />
      )}
    </div>
  );
}
