import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/fetch-all";
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
    // Paginado: um select simples parava em 1000 linhas sem avisar.
    queryFn: () =>
      fetchAllPages<Lead>((from, to) =>
        supabase
          .from("leads")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
          .then(({ data, error }) => ({ data: data as unknown as Lead[] | null, error })),
      ),
  });
}
