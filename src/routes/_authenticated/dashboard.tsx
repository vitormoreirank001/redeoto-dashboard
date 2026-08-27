import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/page-container";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Calendar,
  CalendarCheck,
  ClipboardCheck,
  CheckCircle2,
  PhoneCall,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  formatBRL,
  formatTodayPt,
  greeting,
  monthEndISO,
  monthStartISO,
  saleDay,
  todayISO,
  weekStartISO,
  yesterdayISO,
  type Period,
  PERIOD_LABEL,
  periodRange,
} from "@/lib/date-ranges";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { isAwaitingReply } from "@/lib/lead-sla";
import { COLUMNS } from "./crm";
import type { Lead } from "./crm";
import { CalendarPlus, MessageCircle } from "lucide-react";
import { useLeads } from "@/hooks/use-leads";
import { useUserRole } from "@/hooks/use-user-role";
import { OnboardingChecklist } from "@/components/onboarding-checklist";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function countBetween(items: { date: string }[], start: string, end: string) {
  return items.filter((i) => i.date >= start && i.date <= end).length;
}

const STAGE_LABEL: Record<string, { title: string }> = Object.fromEntries(
  COLUMNS.map((c) => [c.id, { title: c.title }]),
);

/** Tempo decorrido desde um instante, em texto curto (min/h/d). */
function elapsedShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatApptShort(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day} às ${time}`;
}

const REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000;

interface ActionItem {
  lead: Lead;
  kind: "awaiting_reply" | "no_appointment" | "reminder_upcoming";
  detail: string;
  sortKey: number;
}

/** Um motivo por lead, na ordem de urgência: sem resposta > sem agendamento > lembrete próximo. */
function buildActionItem(lead: Lead): ActionItem | null {
  if (isAwaitingReply(lead)) {
    return {
      lead,
      kind: "awaiting_reply",
      detail: `Sem resposta há ${elapsedShort(lead.last_inbound_at!)}`,
      sortKey: new Date(lead.last_inbound_at!).getTime(),
    };
  }
  if (!lead.appointment_date && lead.stage !== "fechado" && lead.stage !== "perdido") {
    return {
      lead,
      kind: "no_appointment",
      detail: "Sem agendamento marcado",
      sortKey: new Date(lead.stage_changed_at).getTime(),
    };
  }
  if (lead.appointment_date) {
    const apptMs = new Date(lead.appointment_date).getTime();
    const now = Date.now();
    if (apptMs > now && apptMs - now <= REMINDER_WINDOW_MS) {
      return {
        lead,
        kind: "reminder_upcoming",
        detail: `Agendado ${formatApptShort(lead.appointment_date)}`,
        sortKey: apptMs,
      };
    }
  }
  return null;
}

function DashboardPage() {
  const { isAdmin } = useUserRole();
  const [userName, setUserName] = useState("");
  const [revenuePeriod, setRevenuePeriod] = useState<Period>("month");
  const [revenueFrom, setRevenueFrom] = useState("");
  const [revenueTo, setRevenueTo] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      setUserName(p?.full_name?.split(" ")[0] || "");
    });
  }, []);

  const { data: allLeads } = useLeads();

  const { data: goalData } = useQuery({
    queryKey: ["monthly_goal", new Date().getFullYear(), new Date().getMonth() + 1],
    queryFn: async () => {
      const { data } = await supabase
        .from("monthly_goals")
        .select("target_amount")
        .eq("year", new Date().getFullYear())
        .eq("month", new Date().getMonth() + 1)
        .maybeSingle();
      return data;
    },
  });

  const { data: inventoryAlerts } = useQuery({
    queryKey: ["inventory_alerts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id,name,expiry_date")
        .not("expiry_date", "is", null);
      return data ?? [];
    },
  });
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const expiringItems = (inventoryAlerts ?? []).filter((i) => {
    const d = Math.round(
      (new Date(i.expiry_date + "T00:00:00").getTime() - today0.getTime()) / 86400000,
    );
    return d <= 4;
  });

  const t = todayISO();
  const y = yesterdayISO();
  const ws = weekStartISO();
  const ms = monthStartISO();
  const me = monthEndISO();

  const leads = allLeads ?? [];
  const entryDay = (l: Lead) => l.entry_date.slice(0, 10);

  const leadsByDate = leads.map((l) => ({ date: entryDay(l) }));
  const apptByDate = leads
    .filter((l) => l.appointment_date)
    .map((l) => ({ date: l.appointment_date!.slice(0, 10) }));
  const evalByDate = leads
    .filter((l) => (l.checklist as Record<string, boolean>)?.avaliacao_realizada)
    .map((l) => ({ date: entryDay(l) }));
  const quoteByDate = leads
    .filter((l) => (l.checklist as Record<string, boolean>)?.orcamento_apresentado)
    .map((l) => ({ date: entryDay(l) }));
  const salesByDate = leads.filter((l) => l.stage === "fechado").map((l) => ({ date: saleDay(l) }));

  const apptToday = leads.filter((l) => l.appointment_date?.slice(0, 10) === t).length;

  const allCalls = leads.flatMap((l) => l.calls ?? []);
  const callDay = (c: { at: string }) => c.at.slice(0, 10);
  const sumCalls = (kind: "made" | "answered", s: string, e: string) =>
    allCalls.filter((c) => callDay(c) >= s && callDay(c) <= e && (kind === "made" || c.answered))
      .length;

  // Faturamento = vendas FECHADAS dentro do período escolhido (saleDay, não
  // entry_date — o lead pode ter entrado num mês e fechado só no seguinte).
  // Meta continua sendo sempre a do mês corrente (monthly_goals não tem
  // conceito de período livre) — comparar um período parcial contra ela é
  // informação válida (ex: "quanto já bati da meta do mês só hoje").
  const revenueRange =
    revenuePeriod === "custom"
      ? { from: revenueFrom || null, to: revenueTo || null }
      : periodRange(revenuePeriod);
  const revenueFiltered = leads
    .filter((l) => {
      if (l.stage !== "fechado") return false;
      const day = saleDay(l);
      if (revenueRange.from && day < revenueRange.from) return false;
      if (revenueRange.to && day > revenueRange.to) return false;
      return true;
    })
    .reduce((a, l) => a + Number(l.budget_amount || 0), 0);

  const goal = goalData?.target_amount ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.round((revenueFiltered / goal) * 100)) : 0;
  const missing = Math.max(0, goal - revenueFiltered);

  const ans = sumCalls("answered", ms, me);
  const made = sumCalls("made", ms, me);
  const rate = made > 0 ? Math.round((ans / made) * 100) : 0;

  const awaitingReplyCount = leads.filter(isAwaitingReply).length;

  const actionQueue = leads
    .map(buildActionItem)
    .filter((x): x is ActionItem => x !== null)
    .sort((a, b) => a.sortKey - b.sortKey);

  return (
    <PageContainer className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Visão Geral</h1>
        <p className="text-muted-foreground mt-0.5 text-sm capitalize">
          {formatTodayPt()} · {greeting()}
          {userName ? `, ${userName}` : ""}
        </p>
      </header>

      {isAdmin && <OnboardingChecklist />}

      {expiringItems.length > 0 && (
        <Link
          to="/estoque"
          className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-4 hover:border-destructive/60 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive font-medium">
            {expiringItems.length} produto(s) do estoque vencendo em até 4 dias — ver Estoque
          </p>
        </Link>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-card border border-border shadow-sm p-5 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/[0.06] blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Faturamento —{" "}
                  {PERIOD_LABEL[revenuePeriod as Exclude<Period, "custom">] ?? "Personalizado"}
                </p>
                <p className="text-4xl font-extrabold text-primary mt-1">
                  {formatBRL(revenueFiltered)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Meta do mês: <span className="text-foreground">{formatBRL(goal)}</span>
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Select value={revenuePeriod} onValueChange={(v) => setRevenuePeriod(v as Period)}>
                <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERIOD_LABEL) as Array<keyof typeof PERIOD_LABEL>).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PERIOD_LABEL[p]}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Personalizado…</SelectItem>
                </SelectContent>
              </Select>
              {revenuePeriod === "custom" && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    value={revenueFrom}
                    onChange={(e) => setRevenueFrom(e.target.value)}
                    className="h-8 w-auto text-xs"
                    aria-label="Data inicial"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input
                    type="date"
                    value={revenueTo}
                    onChange={(e) => setRevenueTo(e.target.value)}
                    className="h-8 w-auto text-xs"
                    aria-label="Data final"
                  />
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>{pct}% atingido</span>
                <span>
                  {goal > 0
                    ? `Faltam ${formatBRL(missing)} para a meta`
                    : "Defina uma meta em Configurações"}
                </span>
              </div>
              <Progress value={pct} className="h-3" />
            </div>
          </div>
        </div>

        <Link
          to="/crm"
          className={cn(
            "relative overflow-hidden rounded-2xl border-2 shadow-sm p-5 pl-6 flex flex-col justify-between transition-colors",
            "before:absolute before:inset-y-0 before:left-0 before:w-1.5",
            awaitingReplyCount > 0 ? "before:bg-primary" : "before:bg-transparent",
            awaitingReplyCount > 0
              ? "bg-destructive/5 border-destructive/40 hover:border-destructive"
              : "bg-card border-border hover:border-primary/40",
          )}
        >
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Leads sem resposta</p>
            <div
              className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                awaitingReplyCount > 0
                  ? "bg-destructive/15 text-destructive"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div>
            <p
              className={cn(
                "text-4xl font-extrabold mt-1",
                awaitingReplyCount > 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {awaitingReplyCount}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {awaitingReplyCount > 0 ? "Aguardando sua resposta — ver no CRM" : "Tudo respondido"}
            </p>
          </div>
        </Link>

        <div
          className={cn(
            "rounded-2xl border-2 shadow-sm p-5 flex flex-col justify-between transition-colors",
            apptToday > 0 ? "bg-success/5 border-success/40" : "bg-card border-border",
          )}
        >
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Agendamentos hoje</p>
            <div
              className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                apptToday > 0 ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground",
              )}
            >
              <CalendarCheck className="h-4 w-4" />
            </div>
          </div>
          <div>
            <p
              className={cn(
                "text-4xl font-extrabold mt-1",
                apptToday > 0 ? "text-success" : "text-foreground",
              )}
            >
              {apptToday}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {apptToday > 0 ? "Cliente(s) agendado(s) para hoje" : "Nenhum agendamento para hoje"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-card border border-border shadow-sm p-5">
        <h2 className="text-sm font-semibold mb-3">Resumo do dia</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead className="text-right">Hoje</TableHead>
                <TableHead className="text-right">Ontem</TableHead>
                <TableHead className="text-right">Semana</TableHead>
                <TableHead className="text-right">Mês</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                {
                  label: "Leads",
                  icon: Users,
                  today: countBetween(leadsByDate, t, t),
                  yesterday: countBetween(leadsByDate, y, y),
                  week: countBetween(leadsByDate, ws, t),
                  month: countBetween(leadsByDate, ms, me),
                },
                {
                  label: "Agendamentos",
                  icon: Calendar,
                  today: countBetween(apptByDate, t, t),
                  yesterday: countBetween(apptByDate, y, y),
                  week: countBetween(apptByDate, ws, t),
                  month: countBetween(apptByDate, ms, me),
                },
                {
                  label: "Avaliações/Orçamentos",
                  icon: ClipboardCheck,
                  today: countBetween(evalByDate, t, t) + countBetween(quoteByDate, t, t),
                  yesterday: countBetween(evalByDate, y, y) + countBetween(quoteByDate, y, y),
                  week: countBetween(evalByDate, ws, t) + countBetween(quoteByDate, ws, t),
                  month: countBetween(evalByDate, ms, me) + countBetween(quoteByDate, ms, me),
                },
                {
                  label: "Vendas",
                  icon: CheckCircle2,
                  today: countBetween(salesByDate, t, t),
                  yesterday: countBetween(salesByDate, y, y),
                  week: countBetween(salesByDate, ws, t),
                  month: countBetween(salesByDate, ms, me),
                },
                {
                  label: "Ligações",
                  icon: PhoneCall,
                  today: sumCalls("made", t, t),
                  yesterday: sumCalls("made", y, y),
                  week: sumCalls("made", ws, t),
                  month: made,
                },
              ].map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <row.icon className="h-3.5 w-3.5 text-primary shrink-0" strokeWidth={1.75} />
                      {row.label}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono-data">{row.today}</TableCell>
                  <TableCell className="text-right font-mono-data">{row.yesterday}</TableCell>
                  <TableCell className="text-right font-mono-data">{row.week}</TableCell>
                  <TableCell className="text-right font-mono-data font-semibold">
                    {row.month}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Ligações atendidas: <span className="text-foreground font-medium">{ans}</span> no mês ·{" "}
          <span className="text-primary font-semibold">{rate}%</span> de atendimento
        </p>
      </section>

      <section className="rounded-2xl bg-card border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Contate agora
          </h2>
          {actionQueue.length > 0 && (
            <Link to="/crm" className="text-xs text-primary hover:underline">
              Ver todos no CRM
            </Link>
          )}
        </div>

        {actionQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nada pendente — tudo em dia.
          </p>
        ) : (
          <div className="space-y-1.5">
            {actionQueue.slice(0, 8).map(({ lead, kind, detail }) => {
              const stageInfo = STAGE_LABEL[lead.stage];
              const detailCls =
                kind === "awaiting_reply"
                  ? "text-destructive"
                  : kind === "no_appointment"
                    ? "text-warning"
                    : "text-success";
              // Leva pro chat do próprio sistema (não pro wa.me) — tanto pra
              // responder quanto pra confirmar o agendamento.
              const showChatButton =
                !!lead.phone_e164 && (kind === "reminder_upcoming" || kind === "awaiting_reply");
              return (
                <Link
                  key={lead.id}
                  to="/crm"
                  search={{ lead: lead.id }}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-secondary/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{lead.name}</span>
                      {stageInfo && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                          {stageInfo.title}
                        </span>
                      )}
                    </div>
                    <p className={cn("text-xs mt-0.5", detailCls)}>
                      {kind === "no_appointment" && (
                        <CalendarPlus className="h-3 w-3 inline mr-1 -mt-0.5" />
                      )}
                      {detail}
                    </p>
                  </div>
                  {showChatButton && (
                    <Link
                      to="/chat"
                      search={{ lead: lead.id }}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 h-8 w-8 rounded-lg bg-success/15 text-success flex items-center justify-center hover:bg-success/25 transition-colors"
                      title="Abrir conversa"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Link>
                  )}
                </Link>
              );
            })}
            {actionQueue.length > 8 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{actionQueue.length - 8} lead(s) pendente(s) — ver no CRM
              </p>
            )}
          </div>
        )}
      </section>
    </PageContainer>
  );
}
