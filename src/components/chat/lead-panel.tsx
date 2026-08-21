import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Pencil, MapPin, Wallet, CalendarClock, Tag } from "lucide-react";
import { formatBRL } from "@/lib/date-ranges";
import { LeadModal, waLink } from "@/components/lead-modal";
import type { Lead } from "@/routes/_authenticated/crm";
import { COLUMNS } from "@/routes/_authenticated/crm";
import { useQueryClient } from "@tanstack/react-query";
import { LEADS_QUERY_KEY } from "@/hooks/use-leads";

function stageLabel(stage: string) {
  return COLUMNS.find((c) => c.id === stage)?.title ?? stage;
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate">{value}</p>
      </div>
    </div>
  );
}

/**
 * Painel do lead (coluna do meio no layout de 3 colunas). Referência visual:
 * layout de conversas do Kommo que o Vitor usa com clientes automotivos —
 * aqui os campos são os do Redeoto (clínica), não os do Kommo (Marketing/SDR/
 * Veículo não existem aqui). A edição de verdade reaproveita o LeadModal que
 * já existe no CRM, em vez de duplicar o formulário.
 */
export function LeadPanel({ lead }: { lead: Lead }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();

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

        <TabsContent value="principal" className="flex-1 overflow-y-auto p-3 space-y-4 mt-0">
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

          <div className="space-y-3">
            <Field
              icon={Tag}
              label="Serviço / Origem"
              value={`${lead.service || "—"} · ${lead.origin || "—"}`}
            />
            <Field
              icon={Wallet}
              label="Orçamento"
              value={lead.budget_amount ? formatBRL(lead.budget_amount) : null}
            />
            <Field
              icon={CalendarClock}
              label="Agendamento"
              value={
                lead.appointment_date
                  ? new Date(lead.appointment_date).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : null
              }
            />
            <Field icon={MapPin} label="Financiamento" value={lead.financing} />
          </div>

          {lead.notes && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Notas</p>
              <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
            </div>
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
