export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function weekStartISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0 sun
  const diff = day === 0 ? 6 : day - 1; // monday-start
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function monthStartISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function monthEndISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
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
