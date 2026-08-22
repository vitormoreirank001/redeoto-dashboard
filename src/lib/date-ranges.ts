/**
 * Data (YYYY-MM-DD) no calendário LOCAL do navegador, sem passar por UTC.
 *
 * `Date.toISOString()` sempre converte pra UTC — no Brasil (UTC-3), isso troca
 * o dia silenciosamente todo fim de noite (~21h-23h59): "agora" já cai no dia
 * seguinte em UTC, e `todayISO()`/`weekStartISO()` passavam a achar que "hoje"
 * era amanhã. `toLocalISO` lê ano/mês/dia direto dos getters locais do Date,
 * então funciona em qualquer hora do dia e em qualquer fuso.
 */
export function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toLocalISO(new Date());
}

export function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalISO(d);
}

export function weekStartISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0 sun
  const diff = day === 0 ? 6 : day - 1; // monday-start
  d.setDate(d.getDate() - diff);
  return toLocalISO(d);
}

export function monthStartISO(): string {
  const d = new Date();
  return toLocalISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function monthEndISO(): string {
  const d = new Date();
  return toLocalISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/**
 * Data em que a venda foi reconhecida, em ISO (YYYY-MM-DD).
 *
 * Faturamento é atribuído ao mês do FECHAMENTO, não ao mês de entrada do lead —
 * um lead pode entrar em junho e fechar em julho. `closed_at` é preenchido pelo
 * trigger `trg_leads_closed_at`; o fallback para `entry_date` cobre registros
 * antigos que ainda não passaram pelo backfill.
 *
 * Só faz sentido para leads com stage = "fechado".
 */
export function saleDay(lead: { closed_at?: string | null; entry_date: string }): string {
  return (lead.closed_at ?? lead.entry_date).slice(0, 10);
}

export function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function formatTodayPt(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Qual data o filtro de período considera (usado onde há venda x entrada). */
export type DateBasis = "entry" | "sale";

export type Period = "all" | "today" | "7d" | "30d" | "month" | "lastmonth" | "custom";

export const PERIOD_LABEL: Record<Exclude<Period, "custom">, string> = {
  all: "Todo o período",
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Este mês",
  lastmonth: "Mês passado",
};

/**
 * Faixa [from, to] inclusiva em YYYY-MM-DD pro período pré-definido escolhido.
 * `null` num dos lados = sem limite daquele lado. Extraído do CRM pra reusar
 * o mesmo filtro no Dashboard (§3 do backlog v4.1.1).
 */
export function periodRange(p: Period): { from: string | null; to: string | null } {
  const now = new Date();
  const today = toLocalISO(now);
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { from: toLocalISO(d), to: today };
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: toLocalISO(d), to: today };
    }
    case "month":
      return {
        from: toLocalISO(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: toLocalISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case "lastmonth":
      return {
        from: toLocalISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toLocalISO(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    default:
      return { from: null, to: null };
  }
}
