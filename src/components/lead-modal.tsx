import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/routes/_authenticated/crm";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";

interface CustomField {
  key: string;
  label: string;
  field_type: "text" | "number" | "boolean" | "select";
  options: string[];
}

function toDatetimeLocal(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string) {
  return new Date(value).toISOString();
}

const STAGES = [
  { id: "novo", label: "🆕 Novo Lead" },
  { id: "contato", label: "📞 Contato Feito" },
  { id: "agendado", label: "📅 Agendado" },
  { id: "orcamento", label: "💰 Em Orçamento" },
  { id: "followup", label: "🔄 Follow-up Ativo" },
  { id: "fechado", label: "✅ Fechado" },
  { id: "perdido", label: "❌ Perdido" },
];

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

export function LeadModal({
  lead,
  initial,
  onClose,
  onSaved,
}: {
  lead: Lead | null;
  initial?: Partial<Lead>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !lead;
  const { isAdmin } = useUserRole();
  const [form, setForm] = useState<Partial<Lead>>(() => ({
    name: "",
    phone: "",
    origin: "",
    media: "",
    service: "outros",
    urgent: false,
    budget_amount: null,
    stage: "novo",
    entry_date: new Date().toISOString(),
    appointment_date: null,
    financing: null,
    checklist: {},
    notes: "",
    history: [],
    calls_made: 0,
    calls_answered: 0,
    custom_data: {},
    ...initial,
    ...lead,
  }));
  const [newNote, setNewNote] = useState("");

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

  const { data: customFields = [] } = useQuery({
    queryKey: ["custom_fields"],
    queryFn: async () => {
      const { data } = await supabase
        .from("custom_fields")
        .select("key,label,field_type,options")
        .order("sort_order");
      return (data ?? []) as CustomField[];
    },
  });

  useEffect(() => {
    if (lead) {
      setForm({
        ...lead,
        checklist: lead.checklist || {},
        history: lead.history || [],
        custom_data: lead.custom_data || {},
      });
    }
  }, [lead]);

  function update<K extends keyof Lead>(key: K, value: Lead[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleCheck(key: string, val: boolean) {
    setForm((f) => ({ ...f, checklist: { ...(f.checklist ?? {}), [key]: val } }));
  }

  function updateCustom(key: string, value: string | number | boolean) {
    setForm((f) => ({ ...f, custom_data: { ...(f.custom_data ?? {}), [key]: value } }));
  }

  async function save() {
    if (!form.name?.trim()) return toast.error("Nome é obrigatório");
    const payload = {
      name: form.name.trim(),
      phone: form.phone || null,
      origin: form.origin || "",
      media: form.media || "",
      service: form.service,
      urgent: !!form.urgent,
      budget_amount: form.budget_amount ? Number(form.budget_amount) : null,
      stage: form.stage,
      entry_date: form.entry_date,
      appointment_date: form.appointment_date || null,
      financing: form.financing || null,
      checklist: form.checklist ?? {},
      notes: form.notes || null,
      history: form.history ?? [],
      calls_made: Number(form.calls_made) || 0,
      calls_answered: Number(form.calls_answered) || 0,
      custom_data: form.custom_data ?? {},
    };
    let error;
    if (isNew) {
      const { data: u } = await supabase.auth.getUser();
      ({ error } = await supabase
        .from("leads")
        .insert({ ...payload, created_by: u.user?.id ?? null }));
    } else {
      ({ error } = await supabase.from("leads").update(payload).eq("id", lead!.id));
    }
    if (error) return toast.error(error.message);
    onSaved();
    onClose();
  }

  async function remove() {
    if (!lead) return;
    if (!confirm("Excluir este lead?")) return;
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) return toast.error(error.message);
    toast.success("Lead removido");
    onSaved();
    onClose();
  }

  function addNote() {
    if (!newNote.trim()) return;
    const entry = { at: new Date().toISOString(), text: newNote.trim() };
    setForm((f) => ({ ...f, history: [entry, ...(f.history ?? [])] }));
    setNewNote("");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {isNew ? "Novo Lead" : form.name || "Editar Lead"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <Field label="Nome *">
            <Input value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} />
          </Field>
          <Field label="Telefone">
            <Input
              value={form.phone ?? ""}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="(31) 99999-0000"
            />
          </Field>
          <Field label="Serviço de interesse">
            <Select value={form.service} onValueChange={(v) => update("service", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="implante">Implante</SelectItem>
                <SelectItem value="aparelho">Aparelho</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mídia (de onde veio)">
            <Select value={form.media || undefined} onValueChange={(v) => update("media", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a mídia" />
              </SelectTrigger>
              <SelectContent>
                {(options?.midia ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Origem (como chegou)">
            <Select value={form.origin || undefined} onValueChange={(v) => update("origin", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a origem" />
              </SelectTrigger>
              <SelectContent>
                {(options?.origem ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Valor do orçamento (R$)">
            <Input
              type="number"
              step="0.01"
              value={form.budget_amount ?? ""}
              onChange={(e) =>
                update("budget_amount", e.target.value ? Number(e.target.value) : null)
              }
            />
          </Field>
          <Field label="Etapa">
            <Select value={form.stage} onValueChange={(v) => update("stage", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data de criação do lead">
            <Input
              type="datetime-local"
              value={toDatetimeLocal(form.entry_date)}
              onChange={(e) => update("entry_date", fromDatetimeLocal(e.target.value))}
            />
          </Field>
          <Field label="Data do agendamento">
            <Input
              type="datetime-local"
              value={form.appointment_date ? toDatetimeLocal(form.appointment_date) : ""}
              onChange={(e) =>
                update(
                  "appointment_date",
                  e.target.value ? fromDatetimeLocal(e.target.value) : null,
                )
              }
            />
          </Field>
          <Field label="Financiamento?">
            <Select
              value={form.financing ?? ""}
              onValueChange={(v) => update("financing", v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
                <SelectItem value="analise">Em análise</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center gap-2 pt-7">
            <Checkbox
              id="urgent"
              checked={!!form.urgent}
              onCheckedChange={(c) => update("urgent", !!c)}
            />
            <Label htmlFor="urgent" className="cursor-pointer">
              Marcar como Urgente
            </Label>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold mb-3">Ligações</h4>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <Field label="Ligações feitas">
              <Input
                type="number"
                min={0}
                value={form.calls_made ?? 0}
                onChange={(e) => update("calls_made", Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Ligações atendidas">
              <Input
                type="number"
                min={0}
                value={form.calls_answered ?? 0}
                onChange={(e) => update("calls_answered", Number(e.target.value) || 0)}
              />
            </Field>
          </div>
        </div>

        {customFields.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold mb-3">Campos personalizados</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customFields.map((cf) => (
                <Field key={cf.key} label={cf.label}>
                  {cf.field_type === "boolean" ? (
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox
                        id={`cf-${cf.key}`}
                        checked={!!form.custom_data?.[cf.key]}
                        onCheckedChange={(v) => updateCustom(cf.key, !!v)}
                      />
                      <Label htmlFor={`cf-${cf.key}`} className="text-sm cursor-pointer">
                        Sim
                      </Label>
                    </div>
                  ) : cf.field_type === "select" ? (
                    <Select
                      value={(form.custom_data?.[cf.key] as string) || undefined}
                      onValueChange={(v) => updateCustom(cf.key, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {cf.options.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={cf.field_type === "number" ? "number" : "text"}
                      value={(form.custom_data?.[cf.key] as string | number) ?? ""}
                      onChange={(e) =>
                        updateCustom(
                          cf.key,
                          cf.field_type === "number" ? Number(e.target.value) || 0 : e.target.value,
                        )
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <h4 className="text-sm font-semibold mb-3">Checklist de etapas</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CHECKLIST.map((c) => (
              <div key={c.key} className="flex items-center gap-2">
                <Checkbox
                  id={c.key}
                  checked={!!form.checklist?.[c.key]}
                  onCheckedChange={(v) => toggleCheck(c.key, !!v)}
                />
                <Label htmlFor={c.key} className="text-sm cursor-pointer">
                  {c.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold mb-3">Histórico / Observações</h4>
          <div className="flex gap-2">
            <Input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Adicionar nota..."
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNote())}
            />
            <Button type="button" variant="secondary" onClick={addNote}>
              Adicionar
            </Button>
          </div>
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
            {(form.history ?? []).map((h, i) => (
              <div key={i} className="bg-background border border-border rounded-md p-2 text-sm">
                <p className="text-[10px] text-muted-foreground">
                  {new Date(h.at).toLocaleString("pt-BR")}
                </p>
                <p>{h.text}</p>
              </div>
            ))}
          </div>
          <Textarea
            className="mt-3"
            placeholder="Notas gerais sobre o lead..."
            value={form.notes ?? ""}
            onChange={(e) => update("notes", e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          {!isNew && isAdmin ? (
            <Button
              variant="ghost"
              onClick={remove}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
