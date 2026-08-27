export interface SlaLead {
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  chat_closed_at: string | null;
}

/**
 * "Sem resposta" — a última mensagem do WhatsApp veio do lead e ninguém da
 * equipe respondeu ainda (e a conversa não foi fechada manualmente depois
 * dela). Substitui o antigo sistema de prazo por tempo-na-etapa: reflete o
 * que importa de verdade no dia a dia — "eu respondi essa pessoa ou não" —
 * em vez de um cronômetro abstrato de SLA. Mesma regra já usada no filtro
 * "Sem resposta" da tela de Chat (`awaitingReply` em chat.tsx).
 */
export function isAwaitingReply(lead: SlaLead): boolean {
  if (!lead.last_inbound_at) return false;
  if (lead.last_outbound_at && lead.last_inbound_at <= lead.last_outbound_at) return false;
  if (lead.chat_closed_at && lead.last_inbound_at <= lead.chat_closed_at) return false;
  return true;
}

/**
 * "Temperatura" do lead sem resposta — o único acento visual ousado do
 * produto. "urgent" = mensagem chegou há menos de 24h (ainda quente, aja
 * agora); "cooling" = já passou de 24h sem resposta (esfriando).
 */
export function leadUrgencyTone(lead: SlaLead): "urgent" | "cooling" | null {
  if (!isAwaitingReply(lead)) return null;
  const waitingMs = Date.now() - new Date(lead.last_inbound_at!).getTime();
  return waitingMs > 24 * 60 * 60 * 1000 ? "cooling" : "urgent";
}
