import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBRL } from "@/lib/date-ranges";
import { LEADS_QUERY_KEY } from "@/hooks/use-leads";

type ItemLixeira = {
  id: string;
  tabela: string;
  registro_id: string;
  dados: Record<string, string | number | null | undefined>;
  apagado_por: string | null;
  apagado_em: string;
  restaurado_em: string | null;
};

const TABELA_LABEL: Record<string, string> = {
  leads: "Lead",
  services: "Serviço",
  expenses: "Custo",
};

// lixeira e restaurar_da_lixeira ainda não estão nos tipos gerados do Supabase
// (migration 20261022000000_lixeira_e_travas).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function descrever(i: ItemLixeira): string {
  const d = i.dados;
  if (i.tabela === "leads") return [d.name, d.phone].filter(Boolean).join(" · ") || "Lead sem nome";
  if (i.tabela === "services") return String(d.name ?? "Serviço");
  if (i.tabela === "expenses")
    return `${d.description ?? "Custo"} · ${formatBRL(Number(d.amount))}`;
  return i.registro_id;
}

/**
 * Tudo o que foi apagado (leads, serviços, custos) com quem apagou e quando.
 * Mensagens do chat apagadas junto com o lead não aparecem uma a uma: voltam
 * junto quando o lead é restaurado. Só admin vê (RLS) — a seção fica dentro de
 * Configurações, que já é adminOnly.
 */
export function Lixeira({ profiles }: { profiles: { id: string; full_name: string | null }[] }) {
  const qc = useQueryClient();
  const { data: itens = [], error } = useQuery({
    queryKey: ["lixeira"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from("lixeira")
        .select("*")
        .neq("tabela", "automation_messages")
        .order("apagado_em", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as ItemLixeira[];
    },
  });

  const restaurar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("restaurar_da_lixeira", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Restaurado");
      qc.invalidateQueries({ queryKey: ["lixeira"] });
      qc.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["leads_finance"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: Error) => toast.error("Não foi possível restaurar", { description: e.message }),
  });

  // Migration da lixeira ainda não aplicada: a seção some sem quebrar a tela.
  if (error) return null;

  const quem = (id: string | null) =>
    id ? profiles.find((p) => p.id === id)?.full_name || "Usuário removido" : "Automação";

  return (
    <section className="bg-card border border-border rounded-xl shadow-sm p-5">
      <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
        <Trash2 className="h-4 w-4 text-primary" />
        Lixeira
      </h2>
      <p className="text-sm text-muted-foreground mb-3">
        Tudo o que foi apagado fica aqui, com quem apagou. Ao restaurar um lead, as mensagens do
        chat dele voltam junto e a venda continua no mês original.
      </p>
      {itens.length === 0 ? (
        <EmptyState icon={Trash2} message="Nada foi apagado ainda." />
      ) : (
        <ul className="divide-y divide-border">
          {itens.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2.5">
              <span className="text-[11px] px-2 py-0.5 rounded bg-secondary text-muted-foreground font-medium shrink-0">
                {TABELA_LABEL[i.tabela] ?? i.tabela}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{descrever(i)}</p>
                <p className="text-xs text-muted-foreground">
                  Apagado por {quem(i.apagado_por)} em{" "}
                  {new Date(i.apagado_em).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              {i.restaurado_em ? (
                <span className="text-xs text-muted-foreground shrink-0">Restaurado</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={restaurar.isPending}
                  onClick={() => restaurar.mutate(i.id)}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Restaurar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
