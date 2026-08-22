import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Lead } from "@/routes/_authenticated/crm";

export type Message = Tables<"automation_messages">;

export function messagesQueryKey(leadId: string) {
  return ["automation_messages", leadId] as const;
}

export function useMessages(leadId: string | null) {
  return useQuery({
    queryKey: leadId ? messagesQueryKey(leadId) : ["automation_messages", "none"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_messages")
        .select("*")
        .eq("lead_id", leadId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!leadId,
  });
}

const N8N_SEND_WEBHOOK_URL =
  import.meta.env.VITE_N8N_SEND_WEBHOOK_URL ||
  "https://n8n.vendacomprocesso.com/webhook/redeoto-outbound-send";

/**
 * Envia mensagem de texto de verdade pelo WhatsApp: chama o webhook do n8n
 * (workflow "Redeoto -> Uazapi (Envio)"), que manda via Uazapi e grava o
 * resultado em automation_messages com o wa_message_id real. O n8n é quem
 * grava no banco (não o front) para o registro só existir se o envio de
 * fato aconteceu — evita mensagem "fantasma" marcada como enviada sem ter
 * saído de verdade.
 *
 * O n8n valida o token de sessão do Supabase (Authorization: Bearer ...)
 * chamando /auth/v1/user antes de processar — sem isso, qualquer visitante
 * do site conseguiria chamar o webhook direto e mandar WhatsApp em nome da
 * clínica para qualquer número (achado de segurança corrigido em 2026-08-22).
 */
export function useSendMessage(lead: Lead | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      if (!lead) throw new Error("Nenhum lead selecionado");
      if (!lead.phone_e164) throw new Error("Lead sem telefone válido para WhatsApp");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada — faça login novamente");

      const res = await fetch(N8N_SEND_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          lead_id: lead.id,
          phone_e164: lead.phone_e164,
          text,
          sender_name: session.user.email ?? "Equipe",
        }),
      });
      if (!res.ok) throw new Error("Falha ao enviar mensagem pelo WhatsApp");
    },
    onSuccess: () => {
      if (lead) qc.invalidateQueries({ queryKey: messagesQueryKey(lead.id) });
    },
  });
}
