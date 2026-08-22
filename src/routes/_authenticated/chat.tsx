import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead } from "./crm";
import { useLeads } from "@/hooks/use-leads";
import { useMessages, useSendMessage } from "@/hooks/use-messages";
import { MessageBubble } from "@/components/chat/message-bubble";
import { LeadPanel } from "@/components/chat/lead-panel";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
  validateSearch: (search: Record<string, unknown>): { lead?: string } => ({
    lead: typeof search.lead === "string" ? search.lead : undefined,
  }),
});

/**
 * "Última atividade" do lead pra ordenar a lista, sem precisar buscar as
 * mensagens de todo mundo (N+1). last_inbound_at é mantido automaticamente
 * pelo trigger trg_messages_touch_lead a cada mensagem recebida; caindo pra
 * stage_changed_at/updated_at enquanto não há nenhuma mensagem real ainda
 * (Uazapi ainda não conectada) — mesma ideia da régua de SLA da automation_foundation.
 */
function lastActivity(lead: Lead): string | null {
  return lead.last_inbound_at ?? lead.stage_changed_at ?? lead.updated_at ?? null;
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
  const { lead: deepLinkedLeadId } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkedLeadId ?? null);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: leads = [] } = useLeads();

  // Abrir direto numa conversa a partir de outra tela (ex: botão "chamar" no
  // Dashboard) — troca de lead se o link mudar enquanto a página já está aberta.
  useEffect(() => {
    if (deepLinkedLeadId) setSelectedId(deepLinkedLeadId);
  }, [deepLinkedLeadId]);
  const selected = leads.find((l) => l.id === selectedId) ?? null;
  const { data: messages = [] } = useMessages(selectedId);
  const sendMessage = useSendMessage(selected);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
      .map((lead) => ({ lead, last: lastActivity(lead) }))
      .filter(({ lead }) => !q || lead.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (!a.last && !b.last) return a.lead.name.localeCompare(b.lead.name);
        if (!a.last) return 1;
        if (!b.last) return -1;
        return b.last.localeCompare(a.last);
      });
  }, [leads, search]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || !selected) return;
    setDraft("");
    try {
      await sendMessage.mutateAsync(text);
    } catch (err) {
      setDraft(text);
      toast.error(err instanceof Error ? err.message : "Falha ao enviar mensagem");
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 h-[calc(100dvh-3.5rem-4rem)] lg:h-screen flex flex-col">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Conversas</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Mensagens de WhatsApp por lead — texto, áudio, foto e vídeo.
        </p>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[300px_1fr] xl:grid-cols-[300px_320px_1fr] bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Coluna 1: lista de conversas */}
        <div
          className={cn(
            "border-r border-border flex-col min-h-0",
            selected ? "hidden md:flex" : "flex",
          )}
        >
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
            {sorted.map(({ lead, last }) => (
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
                    {lead.phone || "Sem telefone"}
                  </p>
                </div>
                {lead.urgent && <span className="h-2 w-2 rounded-full bg-[#7C3AED] shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Coluna 3: thread + composer (ordem no DOM antes do painel do lead pra
            funcionar em mobile: só lista OU só thread aparece, o painel do lead
            fica escondido em telas pequenas, igual o comportamento anterior) */}
        <div className={cn("flex-col min-h-0 xl:order-3", selected ? "flex" : "hidden md:flex")}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Selecione uma conversa
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 border-b border-border shrink-0">
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

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhuma mensagem ainda. As conversas aparecem aqui assim que o número da Uazapi
                    estiver conectado.
                  </p>
                )}
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </div>

              <div className="flex items-center gap-2 p-3 border-t border-border shrink-0">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escreva uma mensagem..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSend())}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!draft.trim() || sendMessage.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Coluna 2: painel do lead — só aparece em telas xl+ pra não competir
            por espaço com a thread em telas menores (mesma lógica responsiva
            do resto do app, que já esconde a lista quando uma conversa está
            aberta em mobile). */}
        {selected && (
          <div className="hidden xl:flex xl:order-2 border-r border-border flex-col min-h-0">
            <LeadPanel lead={selected} />
          </div>
        )}
      </div>
    </div>
  );
}
