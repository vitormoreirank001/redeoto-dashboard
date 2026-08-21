import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

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

/**
 * Grava uma mensagem de saída manual (equipe respondendo pelo próprio sistema).
 * Isto NÃO envia pelo WhatsApp de verdade ainda — o envio real via Uazapi é
 * feito pelo workflow do n8n. Por enquanto isto só registra a mensagem na
 * thread e abre o wa.me como fallback manual, igual o chat.tsx antigo fazia
 * pra notas. Trocar por chamada direta ao n8n (webhook de saída) é o próximo
 * passo, quando o envio de mensagens estiver automatizado.
 */
export function useSendMessage(leadId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!leadId) throw new Error("Nenhum lead selecionado");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("automation_messages").insert({
        lead_id: leadId,
        direction: "outbound",
        message_type: "text",
        body,
        sender_name: user?.email ?? "Equipe",
        is_from_bot: false,
        status: "sent",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (leadId) qc.invalidateQueries({ queryKey: messagesQueryKey(leadId) });
    },
  });
}
