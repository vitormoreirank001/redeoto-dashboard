import { afterEach, describe, expect, it, vi } from "vitest";
import { localDay, periodRange, saleDay, todayISO, toLocalISO } from "./date-ranges";

// Os testes rodam em America/Fortaleza (UTC-3, ver vitest.config.ts).

afterEach(() => vi.useRealTimers());

describe("localDay", () => {
  it("lead que entrou às 22h30 em Fortaleza é do mesmo dia, não do seguinte", () => {
    // 22/10 22:30 local = 23/10 01:30 UTC
    expect(localDay("2026-10-23T01:30:00+00:00")).toBe("2026-10-22");
  });

  it("aceita o formato com Z e com fração de segundo", () => {
    expect(localDay("2026-10-23T01:30:00.123Z")).toBe("2026-10-22");
  });

  it("data pura volta igual", () => {
    expect(localDay("2026-10-22")).toBe("2026-10-22");
  });
});

describe("saleDay", () => {
  it("usa closed_at, não entry_date (lead de junho que fechou em julho é venda de julho)", () => {
    expect(
      saleDay({ entry_date: "2026-06-10T12:00:00+00:00", closed_at: "2026-07-05T15:00:00+00:00" }),
    ).toBe("2026-07-05");
  });

  it("venda fechada às 22h do último dia do mês fica no mês certo", () => {
    // 31/10 22:00 local = 01/11 01:00 UTC
    const day = saleDay({
      entry_date: "2026-10-01T12:00:00+00:00",
      closed_at: "2026-11-01T01:00:00+00:00",
    });
    expect(day).toBe("2026-10-31");
    expect(day.slice(0, 7)).toBe("2026-10");
  });

  it("sem closed_at cai para entry_date (import inicial)", () => {
    expect(saleDay({ entry_date: "2026-06-17T10:00:00+00:00", closed_at: null })).toBe(
      "2026-06-17",
    );
  });
});

describe("toLocalISO / todayISO", () => {
  it("às 23h30 'hoje' ainda é hoje (bug de agosto/2026)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T02:30:00Z")); // 19/08 23:30 local
    expect(todayISO()).toBe("2026-08-19");
  });

  it("formata com zero à esquerda", () => {
    expect(toLocalISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("periodRange", () => {
  it("mês passado em janeiro volta para dezembro do ano anterior", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 0, 15, 10));
    expect(periodRange("lastmonth")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("7 dias inclui hoje e os 6 anteriores", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 22, 10));
    expect(periodRange("7d")).toEqual({ from: "2026-10-16", to: "2026-10-22" });
  });

  it("todo o período não tem limite", () => {
    expect(periodRange("all")).toEqual({ from: null, to: null });
  });
});
