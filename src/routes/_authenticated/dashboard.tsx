import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "@/components/metric-card";
import {
  Users,
  Calendar,
  ClipboardCheck,
  FileText,
  CheckCircle2,
  PhoneCall,
  PhoneIncoming,
  TrendingUp,
} from "lucide-react";
import {
  formatBRL,
  formatTodayPt,
  greeting,
  monthEndISO,
  monthStartISO,
  todayISO,
  weekStartISO,
  yesterdayISO,
} from "@/lib/date-ranges";
import { Progress } from "@/components/ui/progress";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

interface Lead {
  entry_date: string;
  appointment_date: string | null;
  stage: string;
  budget_amount: number | null;
  checklist: Record<string, boolean> | null;
}
interface Call {
  date: string;
  calls_made: number;
  calls_answered: number;
}

function countBetween(items: { date: string }[], start: string, end: string) {
  return items.filter((i) => i.date >= start && i.date <= end).length;
}

function DashboardPage() {
  const [userName, setUserName] = useState("");
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

  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [leadsR, callsR, goalR] = await Promise.all([
        supabase.from("leads").select("entry_date,appointment_date,stage,budget_amount,checklist"),
        supabase.from("daily_calls").select("date,calls_made,calls_answered"),
        supabase
          .from("monthly_goals")
          .select("target_amount")
          .eq("year", new Date().getFullYear())
          .eq("month", new Date().getMonth() + 1)
          .maybeSingle(),
      ]);
      return {
        leads: (leadsR.data ?? []) as Lead[],
        calls: (callsR.data ?? []) as Call[],
        goal: goalR.data?.target_amount ?? 0,
      };
    },
  });

  const t = todayISO();
  const y = yesterdayISO();
  const ws = weekStartISO();
  const ms = monthStartISO();
  const me = monthEndISO();

  const leads = data?.leads ?? [];
  const calls = data?.calls ?? [];

  const leadsByDate = leads.map((l) => ({ date: l.entry_date }));
  const apptByDate = leads
    .filter((l) => l.appointment_date)
    .map((l) => ({ date: l.appointment_date! }));
  const evalByDate = leads
    .filter((l) => (l.checklist as Record<string, boolean>)?.avaliacao_realizada)
    .map((l) => ({ date: l.entry_date }));
  const quoteByDate = leads
    .filter((l) => (l.checklist as Record<string, boolean>)?.orcamento_apresentado)
    .map((l) => ({ date: l.entry_date }));
  const salesByDate = leads.filter((l) => l.stage === "fechado").map((l) => ({ date: l.entry_date }));

  const sumCalls = (k: "calls_made" | "calls_answered", s: string, e: string) =>
    calls.filter((c) => c.date >= s && c.date <= e).reduce((a, c) => a + (c[k] || 0), 0);

  const revenueMonth = leads
    .filter((l) => l.stage === "fechado" && l.entry_date >= ms && l.entry_date <= me)
    .reduce((a, l) => a + Number(l.budget_amount || 0), 0);

  const goal = data?.goal ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.round((revenueMonth / goal) * 100)) : 0;
  const missing = Math.max(0, goal - revenueMonth);

  const ans = sumCalls("calls_answered", ms, me);
  const made = sumCalls("calls_made", ms, me);
  const rate = made > 0 ? Math.round((ans / made) * 100) : 0;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Visão Geral</h1>
        <p className="text-muted-foreground mt-1 capitalize">
          {formatTodayPt()} · {greeting()}
          {userName ? `, ${userName}` : ""}
        </p>
      </header>

      <Section title="Leads">
        <MetricCard
          title="Leads"
          icon={Users}
          today={countBetween(leadsByDate, t, t)}
          yesterday={countBetween(leadsByDate, y, y)}
          week={countBetween(leadsByDate, ws, t)}
          month={countBetween(leadsByDate, ms, me)}
        />
      </Section>

      <Section title="Agendamentos">
        <MetricCard
          title="Agendamentos Criados"
          icon={Calendar}
          today={countBetween(apptByDate, t, t)}
          yesterday={countBetween(apptByDate, y, y)}
          week={countBetween(apptByDate, ws, t)}
          month={countBetween(apptByDate, ms, me)}
        />
      </Section>

      <Section title="Atendimento">
        <MetricCard
          title="Avaliações Realizadas"
          icon={ClipboardCheck}
          today={countBetween(evalByDate, t, t)}
          yesterday={countBetween(evalByDate, y, y)}
          week={countBetween(evalByDate, ws, t)}
          month={countBetween(evalByDate, ms, me)}
        />
        <MetricCard
          title="Orçamentos Apresentados"
          icon={FileText}
          today={countBetween(quoteByDate, t, t)}
          yesterday={countBetween(quoteByDate, y, y)}
          week={countBetween(quoteByDate, ws, t)}
          month={countBetween(quoteByDate, ms, me)}
        />
        <MetricCard
          title="Vendas"
          icon={CheckCircle2}
          today={countBetween(salesByDate, t, t)}
          yesterday={countBetween(salesByDate, y, y)}
          week={countBetween(salesByDate, ws, t)}
          month={countBetween(salesByDate, ms, me)}
        />
      </Section>

      <Section title="Ligações">
        <MetricCard
          title="Ligações Feitas"
          icon={PhoneCall}
          today={sumCalls("calls_made", t, t)}
          yesterday={sumCalls("calls_made", y, y)}
          week={sumCalls("calls_made", ws, t)}
          month={made}
        />
        <MetricCard
          title="Ligações Atendidas"
          icon={PhoneIncoming}
          today={sumCalls("calls_answered", t, t)}
          yesterday={sumCalls("calls_answered", y, y)}
          week={sumCalls("calls_answered", ws, t)}
          month={ans}
          footer={
            <p className="text-xs text-muted-foreground">
              Taxa de atendimento (mês):{" "}
              <span className="text-primary font-semibold">{rate}%</span>
            </p>
          }
        />
      </Section>

      <section>
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
          Faturamento
        </h2>
        <div className="rounded-2xl bg-card border-2 border-primary/50 p-7 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Faturamento do mês</p>
                <p className="text-5xl font-extrabold text-primary mt-2">
                  {formatBRL(revenueMonth)}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Meta: <span className="text-foreground">{formatBRL(goal)}</span>
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-6">
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
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </section>
  );
}
