import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Pencil, CheckCircle2, Circle } from "lucide-react";
import { formatBRL } from "@/lib/date-ranges";
import { LeadModal, waLink, groupCustomFields, type CustomField } from "@/components/lead-modal";
import type { Lead } from "@/routes/_authenticated/crm";
import { COLUMNS } from "@/routes/_authenticated/crm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LEADS_QUERY_KEY } from "@/hooks/use-leads";
import { supabase } from "@/integrations/supabase/client";

// Mesma lista/labels do checklist em lead-modal.tsx — mantida em sincronia
// manual de propósito (é só leitura aqui, quem edita é o modal).
const CHECKLIST = [
  { key: "primeiro_contato", label: "Primeiro contato feito" },
  { key: "agendamento_oferecido", label: "Agendamento oferecido" },
  { key: "avaliacao_realizada", label: "Avaliação realizada" },
  { key: "orcamento_apresentado", label: "Orçamento apresentado" },
  { key: "followup_24h", label: "Follow-up 24h" },
  { key: "followup_3d", label: "Follow-up 3 dias" },
  { key: "followup_7d", label: "Follow-up 7 dias" },
  { key: "followup_14d", label: "Follow-up 14 dias" },
];

function stageLabel(stage: string) {
  return COLUMNS.find((c) => c.id === stage)?.title ?? stage;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-sm">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p>{value || "—"}</p>
    </div>
  );
}

/**
 * Painel do lead (coluna do meio no layout de 3 colunas). Referência visual:
 * layout de conversas do Kommo que o Vitor usa com clientes automotivos.
 * Ajustado depois do print de feedback: em vez de mostrar só um resumo,
 * espelha as mesmas seções do formulário de edição (Contato / Comercial /
 * Etapa e agendamento / Checklist) — assim dá pra ver tudo sem abrir o
 * modal. A edição em si continua reaproveitando o LeadModal existente.
 */
function customFieldValueLabel(cf: CustomField, raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (cf.field_type === "boolean") return raw ? "Sim" : "Não";
  return String(raw);
}

export function LeadPanel({ lead }: { lead: Lead }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();

  // Mesma queryKey do LeadModal — cache compartilhado, sem requisição extra
  // se o modal já buscou os campos personalizados antes.
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

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border shrink-0 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{lead.name}</p>
          <Badge variant="secondary" className="mt-1 text-[10px]">
            {stageLabel(lead.stage)}
          </Badge>
        </div>
        <Button variant="outline" size="icon" className="shrink-0" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Tabs defaultValue="principal" className="flex-1 min-h-0 flex flex-col">
        <TabsList className="mx-3 mt-2 w-auto shrink-0">
          <TabsTrigger value="principal" className="flex-1">
            Principal
          </TabsTrigger>
          <TabsTrigger value="atividade" className="flex-1">
            Atividade
          </TabsTrigger>
        </TabsList>

        <TabsContent value="principal" className="flex-1 overflow-y-auto p-3 space-y-5 mt-0">
          {lead.phone_e164 && (
            <a
              href={waLink(lead.phone_e164)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg bg-success/15 text-[#16A34A] px-3 py-2 text-sm hover:bg-success/25 transition-colors"
            >
              <Phone className="h-4 w-4" />
              {lead.phone}
            </a>
          )}

          <Section title="Contato">
            <div className="grid grid-cols-2 gap-3">
              <Row label="Telefone" value={lead.phone} />
              <Row label="Mídia (de onde veio)" value={lead.media} />
              <Row label="Origem (como chegou)" value={lead.origin} />
            </div>
          </Section>

          <Section title="Comercial">
            <div className="grid grid-cols-2 gap-3">
              <Row label="Serviço de interesse" value={lead.service} />
              <Row
                label="Valor do orçamento"
                value={lead.budget_amount ? formatBRL(lead.budget_amount) : null}
              />
              <Row label="Financiamento?" value={lead.financing} />
              <Row label="Urgente" value={lead.urgent ? "Sim" : "Não"} />
            </div>
          </Section>

          <Section title="Etapa e agendamento">
            <div className="grid grid-cols-2 gap-3">
              <Row label="Etapa" value={stageLabel(lead.stage)} />
              <Row label="Data de criação do lead" value={fmtDateTime(lead.entry_date)} />
              <Row label="Data do agendamento" value={fmtDateTime(lead.appointment_date)} />
            </div>
          </Section>

          {groupCustomFields(customFields).map(([groupName, fields]) => (
            <Section key={groupName} title={groupName}>
              <div className="grid grid-cols-2 gap-3">
                {fields.map((cf) => (
                  <Row
                    key={cf.key}
                    label={cf.label}
                    value={customFieldValueLabel(cf, lead.custom_data?.[cf.key])}
                  />
                ))}
              </div>
            </Section>
          ))}

          <Section title="Checklist de etapas">
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-2">
              {CHECKLIST.map((c) => {
                const done = !!lead.checklist?.[c.key];
                return (
                  <div key={c.key} className="flex items-center gap-1.5 text-xs">
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A] shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={done ? "" : "text-muted-foreground"}>{c.label}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          {lead.notes && (
            <Section title="Observações">
              <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
            </Section>
          )}
        </TabsContent>

        <TabsContent value="atividade" className="flex-1 overflow-y-auto p-3 space-y-2 mt-0">
          {(lead.history ?? []).length === 0 && (lead.calls ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sem atividade registrada.
            </p>
          ) : (
            [
              ...(lead.history ?? []).map((h) => ({ at: h.at, text: h.text })),
              ...(lead.calls ?? []).map((c) => ({
                at: c.at,
                text: c.answered ? "Ligação atendida" : "Ligação não atendida",
              })),
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((e, i) => (
                <div key={i} className="text-xs border-b border-border/60 pb-2">
                  <p className="text-muted-foreground">
                    {new Date(e.at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p>{e.text}</p>
                </div>
              ))
          )}
        </TabsContent>
      </Tabs>

      {editing && (
        <LeadModal
          lead={lead}
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
