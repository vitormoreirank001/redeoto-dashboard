/**
 * O PostgREST do Supabase devolve no máximo 1000 linhas por consulta e corta
 * o resto SEM erro. Com `leads` crescendo ~170/mês, um `select` simples
 * passaria a perder os leads mais antigos em silêncio (faturamento, recorrência
 * e agenda errados). Foi exatamente o que aconteceu na Estrela do Mar em 09/2026:
 * o faturamento "travou" em R$ 55 mil porque só os 1000 pedidos mais recentes
 * chegavam ao painel.
 *
 * `fetchAllPages` percorre a tabela em páginas de `pageSize` até vir uma página
 * incompleta. Quem chama monta a query com uma ordenação ESTÁVEL (sempre
 * desempatar por `id`), senão linhas com o mesmo `created_at` podem pular ou
 * repetir entre páginas.
 */
export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}
