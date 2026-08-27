import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead } from "./crm";
import { supabase } from "@/integrations/supabase/client";
import { useLeads, LEADS_QUERY_KEY } from "@/hooks/use-leads";
import { useMessages, useSendMessage } from "@/hooks/use-messages";
import { MessageBubble } from "@/components/chat/message-bubble";
import { LeadPanel } from "@/components/chat/lead-panel";
import { PageContainer } from "@/components/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { isAwaitingReply } from "@/lib/lead-sla";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
  validateSearch: (search: Record<string, unknown>): { lead?: string } => ({
    lead: typeof search.lead === "string" ? search.lead : undefined,
  }),
});

/**
 * "Última atividade" do lead pra ordenar a lista, sem precisar buscar as
 * mensagens de todo mundo (N+1). Só considera mensagem de verdade (inbound
 * ou outbound) — não usa mais stage_changed_at/updated_at como fallback,
 * senão mover o lead de etapa no CRM (sem nenhuma mensagem nova) bagunçava
 * a ordenação e fazia parecer que chegou coisa nova no chat.
 */
function lastActivity(lead: Lead): string | null {
  const { last_inbound_at, last_outbound_at } = lead;
  if (last_inbound_at && last_outbound_at) {
    return last_inbound_at > last_outbound_at ? last_inbound_at : last_outbound_at;
  }
  return last_inbound_at ?? last_outbound_at ?? null;
}

const CHAT_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "awaiting", label: "Sem resposta" },
  { id: "scheduled", label: "Agendados" },
] as const;
type ChatFilter = (typeof CHAT_FILTERS)[number]["id"];

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

/** Evento de mudança/nota do lead, mostrado como mensagem de sistema na
 * própria thread (referência: linha do tempo do Kommo dentro da conversa),
 * em vez de uma aba "Atividade" separada duplicando o que já está aqui. */
function SystemMessage({ at, text }: { at: string; text: string }) {
  return (
    <div className="flex justify-center">
      <p className="text-[11px] text-muted-foreground bg-secondary/70 rounded-full px-3 py-1 text-center">
        {text} ·{" "}
        {new Date(at).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
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
  const { lead: deepLinkedLeadId } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkedLeadId ?? null);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: leads = [] } = useLeads();

  const closeConversation = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from("leads")
        .update({ chat_closed_at: new Date().toISOString() })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LEADS_QUERY_KEY }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao fechar conversa"),
  });

  // Abrir direto numa conversa a partir de outra tela (ex: botão "chamar" no
  // Dashboard) — troca de lead se o link mudar enquanto a página já está aberta.
  useEffect(() => {
    if (deepLinkedLeadId) setSelectedId(deepLinkedLeadId);
  }, [deepLinkedLeadId]);
  const selected = leads.find((l) => l.id === selectedId) ?? null;
  const { data: messages = [] } = useMessages(selectedId);
  const sendMessage = useSendMessage(selected);

  // Mensagens de verdade + eventos do histórico do lead (troca de etapa, notas)
  // numa timeline só, ordenada por horário — é o que hoje ficava espalhado
  // numa aba "Atividade" separada no painel do lead.
  const timeline = useMemo(() => {
    const msgItems = messages.map((m) => ({
      kind: "message" as const,
      at: m.created_at,
      message: m,
    }));
    const eventItems = (selected?.history ?? []).map((h) => ({
      kind: "event" as const,
      at: h.at,
      text: h.text,
    }));
    return [...msgItems, ...eventItems].sort((a, b) => a.at.localeCompare(b.at));
  }, [messages, selected]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
      .map((lead) => ({ lead, last: lastActivity(lead) }))
      .filter(
        ({ lead }) =>
          !q || lead.name.toLowerCase().includes(q) || (lead.phone ?? "").toLowerCase().includes(q),
      )
      .filter(({ lead }) => {
        if (filter === "awaiting") return isAwaitingReply(lead);
        if (filter === "scheduled") return lead.stage === "agendado";
        return true;
      })
      .sort((a, b) => {
        if (!a.last && !b.last) return a.lead.name.localeCompare(b.lead.name);
        if (!a.last) return 1;
        if (!b.last) return -1;
        return b.last.localeCompare(a.last);
      });
  }, [leads, search, filter]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [timeline.length]);

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

  // A biblioteca de painéis (Group/Panel/Separator) não combina com o truque
  // de "esconder com hidden/flex" que o layout de celular usava — o painel
  // escondido ainda reservaria espaço no grupo. Por isso a decisão de
  // mobile x tablet/desktop agora é em JS: abaixo de md (768px) usa o layout
  // simples empilhado (só lista OU só thread); a partir daí usa o grupo
  // redimensionável (arrastar pra ajustar a largura de cada coluna).
  const isMobile = useIsMobile(768);
  const isBelowXl = useIsMobile(1280);
  const showLeadPanel = !!selected && !isBelowXl;

  const listContent = (
    <>
      <div className="p-3 border-b border-border shrink-0 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="pl-8 h-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CHAT_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "text-xs px-2.5 h-7 rounded-md border font-medium transition-colors",
                filter === f.id
                  ? "bg-primary/15 border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && <EmptyState message="Nenhum lead encontrado." />}
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
              <div className="flex flex-wrap gap-1 mt-1">
                {isAwaitingReply(lead) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">
                    Sem resposta
                  </span>
                )}
                {lead.confirmation_status === "confirmado" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success font-medium">
                    Confirmado
                  </span>
                )}
                {lead.confirmation_status === "remarcar" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-medium">
                    Pediu para remarcar
                  </span>
                )}
              </div>
            </div>
            {lead.urgent && <span className="h-2 w-2 rounded-full bg-purple shrink-0" />}
          </button>
        ))}
      </div>
    </>
  );

  const threadContent = !selected ? (
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
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{selected.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {selected.phone || "Sem telefone"}
          </p>
        </div>
        {isAwaitingReply(selected) && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0"
            disabled={closeConversation.isPending}
            onClick={() => closeConversation.mutate(selected.id)}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Fechar conversa
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {timeline.length === 0 && (
          <EmptyState message="Nenhuma mensagem ainda. As conversas aparecem aqui assim que o número estiver conectado ao WhatsApp." />
        )}
        {timeline.map((item, i) =>
          item.kind === "message" ? (
            <MessageBubble key={item.message.id} message={item.message} />
          ) : (
            <SystemMessage key={`event-${i}`} at={item.at} text={item.text} />
          ),
        )}
      </div>

      <div className="flex items-center gap-2 p-3 border-t border-border shrink-0">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma mensagem..."
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSend())}
          className="flex-1"
        />
        <Button size="icon" onClick={handleSend} disabled={!draft.trim() || sendMessage.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </>
  );

  return (
    <PageContainer
      bleed
      className="space-y-4 h-[calc(100dvh-3.5rem-4rem)] lg:h-screen flex flex-col"
    >
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Conversas</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Mensagens de WhatsApp por lead — texto, áudio, foto e vídeo.
        </p>
      </header>

      {isMobile ? (
        <div className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {selected ? threadContent : listContent}
        </div>
      ) : (
        <Group
          orientation="horizontal"
          className="flex-1 min-h-0 bg-card border border-border rounded-xl shadow-sm overflow-hidden"
        >
          <Panel
            id="list"
            defaultSize={300}
            minSize={240}
            maxSize={440}
            className="border-r border-border flex flex-col min-h-0"
          >
            {listContent}
          </Panel>
          <Separator className="w-1 shrink-0 bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors cursor-col-resize" />
          {showLeadPanel && (
            <>
              <Panel
                id="leadpanel"
                defaultSize={320}
                minSize={260}
                maxSize={480}
                className="border-r border-border flex flex-col min-h-0"
              >
                <LeadPanel lead={selected!} />
              </Panel>
              <Separator className="w-1 shrink-0 bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors cursor-col-resize" />
            </>
          )}
          <Panel id="thread" minSize={320} className="flex flex-col min-h-0">
            {threadContent}
          </Panel>
        </Group>
      )}
    </PageContainer>
  );
}
