import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/routes/_authenticated/crm";

/**
 * Fonte única da tabela leads (select("*")) para CRM/Dashboard/Chat/Agendamento.
 * Antes cada tela buscava por conta própria sob uma chave de cache diferente —
 * navegar entre elas disparava uma viagem de rede nova a cada troca de aba. Com
 * a mesma chave ["leads"], o react-query compartilha o cache: quem chega
 * depois vê o dado na hora e só revalida em segundo plano.
 */
export const LEADS_QUERY_KEY = ["leads"] as const;

export function useLeads() {
  return useQuery({
    queryKey: LEADS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Lead[]) ?? [];
    },
  });
}
