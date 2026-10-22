import { describe, expect, it } from "vitest";
import { fetchAllPages } from "./fetch-all";

// Simula o PostgREST: devolve no máximo `cap` linhas por chamada, como o
// Supabase faz com o limite de 1000.
function fakeTable(total: number, cap: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { fetchPage, calls };
}

describe("fetchAllPages", () => {
  it("traz todas as linhas quando a tabela passa do limite por página", async () => {
    const { fetchPage, calls } = fakeTable(2500, 1000);
    const rows = await fetchAllPages(fetchPage);
    expect(rows).toHaveLength(2500);
    expect(rows.at(-1)).toEqual({ id: 2499 });
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("para depois de uma página vazia quando o total é múltiplo exato da página", async () => {
    const { fetchPage, calls } = fakeTable(2000, 1000);
    expect(await fetchAllPages(fetchPage)).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it("tabela pequena faz uma chamada só", async () => {
    const { fetchPage, calls } = fakeTable(794, 1000);
    expect(await fetchAllPages(fetchPage)).toHaveLength(794);
    expect(calls).toHaveLength(1);
  });

  it("propaga o erro do Supabase em vez de devolver lista parcial", async () => {
    await expect(
      fetchAllPages(async () => ({ data: null, error: { message: "JWT expired" } })),
    ).rejects.toThrow("JWT expired");
  });
});
