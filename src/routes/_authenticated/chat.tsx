import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Send, Phone, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { waLink } from "@/components/lead-modal";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  phone_e164: string | null;
  urgent: boolean;
  history: Array<{ at: string; text: string }>;
  calls: Array<{ at: string; answered: boolean }>;
}

type TimelineEntry =
  | { kind: "note"; at: string; text: string }
  | { kind: "call"; at: string; answered: boolean };

function timeline(lead: Lead): TimelineEntry[] {
  const notes: TimelineEntry[] = (lead.history ?? []).map((h) => ({
    kind: "note",
    at: h.at,
    text: h.text,
  }));
  const calls: TimelineEntry[] = (lead.calls ?? []).map((c) => ({
    kind: "call",
    at: c.at,
    answered: c.answered,
  }));
  return [...notes, ...calls].sort((a, b) => a.at.localeCompare(b.at));
}

function previewText(entry: TimelineEntry | undefined): string {
  if (!entry) return "Sem contato registrado ainda";
  if (entry.kind === "note") return entry.text;
  return entry.answered ? "📞 Ligação atendida" : "📞 Ligação não atendida";
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function ChatPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const { data: leads = [] } = useQuery({
    queryKey: ["chat_leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,name,phone,phone_e164,urgent,history,calls");
      if (error) throw error;
      return (data ?? []) as unknown as Lead[];
    },
  });

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
      .map((lead) => {
        const t = timeline(lead);
        return { lead, t, last: t.length ? t[t.length - 1].at : null };
      })
      .filter(({ lead }) => !q || lead.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (!a.last && !b.last) return a.lead.name.localeCompare(b.lead.name);
        if (!a.last) return 1;
        if (!b.last) return -1;
        return b.last.localeCompare(a.last);
      });
  }, [leads, search]);

  const selected = leads.find((l) => l.id === selectedId) ?? null;
  const selectedTimeline = selected ? timeline(selected) : [];

  async function persistNote(text: string) {
    if (!selected) return false;
    const entry = { at: new Date().toISOString(), text };
    const newHistory = [entry, ...(selected.history ?? [])];
    const { error } = await supabase
      .from("leads")
      .update({ history: newHistory })
      .eq("id", selected.id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    qc.invalidateQueries({ queryKey: ["chat_leads"] });
    return true;
  }

  async function saveNoteOnly() {
    const text = draft.trim();
    if (!text) return;
    if (await persistNote(text)) setDraft("");
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !selected) return;
    if (!(await persistNote(text))) return;
    if (selected.phone_e164) {
      window.open(waLink(selected.phone_e164, text), "_blank");
    }
    setDraft("");
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 h-[calc(100dvh-3.5rem-4rem)] lg:h-screen flex flex-col">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Histórico de contato por lead — notas e ligações, mais recente primeiro.
        </p>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr] bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className={cn("border-r border-border flex-col min-h-0", selected ? "hidden md:flex" : "flex")}>
          <div className="p-3 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Procurar..."
                className="pl-8 h-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sorted.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum lead encontrado.
              </p>
            )}
            {sorted.map(({ lead, t, last }) => (
              <button
                key={lead.id}
                onClick={() => setSelectedId(lead.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-left border-b border-border/60 hover:bg-secondary/50 transition-colors",
                  selectedId === lead.id && "bg-secondary",
                )}
              >
                <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                  {initials(lead.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{lead.name}</span>
                    {last && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {relativeTime(last)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {previewText(t[t.length - 1])}
                  </p>
                </div>
                {lead.urgent && <span className="h-2 w-2 rounded-full bg-[#7C3AED] shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        <div className={cn("flex-col min-h-0", selected ? "flex" : "hidden md:flex")}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Selecione uma conversa
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 p-3 border-b border-border shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setSelectedId(null)}
                    className="md:hidden text-muted-foreground px-1"
                  >
                    ←
                  </button>
                  <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                    {initials(selected.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{selected.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {selected.phone || "Sem telefone"}
                    </p>
                  </div>
                </div>
                {selected.phone_e164 && (
                  <a
                    href={waLink(selected.phone_e164)}
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 w-9 rounded-lg bg-success/15 text-[#16A34A] flex items-center justify-center hover:bg-success/25 transition-colors shrink-0"
                    title="Abrir WhatsApp"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {selectedTimeline.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Sem notas ou ligações registradas ainda.
                  </p>
                )}
                {selectedTimeline.map((entry, i) =>
                  entry.kind === "note" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[75%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2">
                        <p className="text-sm whitespace-pre-wrap">{entry.text}</p>
                        <p className="text-[10px] opacity-80 mt-1">
                          {new Date(entry.at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex justify-center">
                      <div
                        className={cn(
                          "text-xs px-3 py-1 rounded-full",
                          entry.answered
                            ? "bg-success/15 text-[#16A34A]"
                            : "bg-destructive/15 text-destructive",
                        )}
                      >
                        {entry.answered ? "📞 Ligação atendida" : "📞 Ligação não atendida"} ·{" "}
                        {new Date(entry.at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  ),
                )}
              </div>

              <div className="flex items-center gap-2 p-3 border-t border-border shrink-0">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Digite uma nota ou mensagem..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), sendMessage())}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={saveNoteOnly}
                  title="Salvar só como nota interna (não envia WhatsApp)"
                  disabled={!draft.trim()}
                >
                  <StickyNote className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={sendMessage}
                  disabled={!draft.trim()}
                  title="Salvar nota e enviar no WhatsApp"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
