import { afterEach, describe, expect, it, vi } from "vitest";
import { isAwaitingReply, leadUrgencyTone } from "./lead-sla";

const lead = (p: Partial<Parameters<typeof isAwaitingReply>[0]>) => ({
  last_inbound_at: null,
  last_outbound_at: null,
  chat_closed_at: null,
  ...p,
});

afterEach(() => vi.useRealTimers());

describe("isAwaitingReply", () => {
  it("sem mensagem do paciente não está esperando resposta", () => {
    expect(isAwaitingReply(lead({}))).toBe(false);
  });

  it("paciente mandou e ninguém respondeu", () => {
    expect(isAwaitingReply(lead({ last_inbound_at: "2026-10-22T13:00:00+00:00" }))).toBe(true);
  });

  it("equipe respondeu depois", () => {
    expect(
      isAwaitingReply(
        lead({
          last_inbound_at: "2026-10-22T13:00:00+00:00",
          last_outbound_at: "2026-10-22T13:05:00+00:00",
        }),
      ),
    ).toBe(false);
  });

  it("conversa fechada manualmente depois da mensagem", () => {
    expect(
      isAwaitingReply(
        lead({
          last_inbound_at: "2026-10-22T13:00:00+00:00",
          chat_closed_at: "2026-10-22T13:10:00.000Z",
        }),
      ),
    ).toBe(false);
  });

  it("compara instantes mesmo com fusos diferentes", () => {
    // 10:30 em -03:00 = 13:30 UTC, depois da resposta das 13:05 UTC
    expect(
      isAwaitingReply(
        lead({
          last_inbound_at: "2026-10-22T10:30:00-03:00",
          last_outbound_at: "2026-10-22T13:05:00+00:00",
        }),
      ),
    ).toBe(true);
  });
});

describe("leadUrgencyTone", () => {
  it("menos de 24h sem resposta = urgente; mais = esfriando", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T15:00:00Z"));
    expect(leadUrgencyTone(lead({ last_inbound_at: "2026-10-22T13:00:00Z" }))).toBe("urgent");
    expect(leadUrgencyTone(lead({ last_inbound_at: "2026-10-21T13:00:00Z" }))).toBe("cooling");
    expect(leadUrgencyTone(lead({}))).toBe(null);
  });
});
