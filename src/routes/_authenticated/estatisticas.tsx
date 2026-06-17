import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatBRL } from "@/lib/date-ranges";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/estatisticas")({
  component: StatsPage,
});

type Range = "today" | "7d" | "30d" | "month";

function rangeStart(r: Range): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === "today") return d;
  if (r === "7d") {
    d.setDate(d.getDate() - 6);
    return d;
  }
  if (r === "30d") {
    d.setDate(d.getDate() - 29);
    return d;
  }
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function StatsPage() {
  const [range, setRange] = useState<Range>("30d");

  const { data } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const [leadsR, callsR] = await Promise.all([
        supabase.from("leads").select("*"),
        supabase.from("daily_calls").select("*"),
      ]);
      return { leads: leadsR.data ?? [], calls: callsR.data ?? [] };
    },
  });

  const start = rangeStart(range);
  const leads = (data?.leads ?? []).filter((l: any) => new Date(l.entry_date) >= start);
  const calls = (data?.calls ?? []).filter((c: any) => new Date(c.date) >= start);

  const series = useMemo(() => {
    const days: Record<string, { date: string; leads: number; agend: number; vendas: number }> = {};
    const end = new Date();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      days[k] = { date: k, leads: 0, agend: 0, vendas: 0 };
    }
    leads.forEach((l: any) => {
      const k = l.entry_date;
      if (days[k]) days[k].leads++;
      if (l.appointment_date && days[l.appointment_date]) days[l.appointment_date].agend++;
      if (l.stage === "fechado" && days[k]) days[k].vendas++;
    });
    return Object.values(days).map((d) => ({
      ...d,
      label: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    }));
  }, [leads, start]);

  // Funnel
  const total = leads.length;
  const contato = leads.filter((l: any) => l.checklist?.primeiro_contato || ["contato","agendado","orcamento","followup","fechado"].includes(l.stage)).length;
  const agendado = leads.filter((l: any) => l.appointment_date || ["agendado","orcamento","followup","fechado"].includes(l.stage)).length;
  const avaliacao = leads.filter((l: any) => l.checklist?.avaliacao_realizada).length;
  const orcamento = leads.filter((l: any) => l.checklist?.orcamento_apresentado || ["orcamento","fechado"].includes(l.stage)).length;
  const venda = leads.filter((l: any) => l.stage === "fechado").length;

  const funnel = [
    { name: "Leads", value: total },
    { name: "Contato", value: contato },
    { name: "Agendado", value: agendado },
    { name: "Avaliação", value: avaliacao },
    { name: "Orçamento", value: orcamento },
    { name: "Venda", value: venda },
  ];

  // Services breakdown
  const svcMap: Record<string, { count: number; revenue: number }> = {
    implante: { count: 0, revenue: 0 },
    aparelho: { count: 0, revenue: 0 },
    outros: { count: 0, revenue: 0 },
  };
  leads.filter((l: any) => l.stage === "fechado").forEach((l: any) => {
    svcMap[l.service] = svcMap[l.service] || { count: 0, revenue: 0 };
    svcMap[l.service].count++;
    svcMap[l.service].revenue += Number(l.budget_amount || 0);
  });
  const svcData = Object.entries(svcMap).map(([k, v]) => ({
    name: k === "implante" ? "Implante" : k === "aparelho" ? "Aparelho" : "Outros",
    count: v.count,
    revenue: v.revenue,
  }));

  // Calls
  const callsData = calls
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
    .map((c: any) => ({
      label: new Date(c.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      feitas: c.calls_made,
      atendidas: c.calls_answered,
    }));

  const tickStyle = { fill: "oklch(0.7 0 0)", fontSize: 11 };
  const tooltipStyle = {
    backgroundColor: "oklch(0.205 0 0)",
    border: "1px solid oklch(0.27 0 0)",
    borderRadius: 8,
    color: "white",
  };

  const SVC_COLORS = ["#FF6B00", "oklch(0.82 0.17 85)", "oklch(0.7 0 0)"];

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Estatísticas</h1>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {(["today", "7d", "30d", "month"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md font-medium transition-colors",
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r === "today" ? "Hoje" : r === "7d" ? "7 dias" : r === "30d" ? "30 dias" : "Este mês"}
            </button>
          ))}
        </div>
      </header>

      <Card title="Tendências">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={series}>
            <CartesianGrid stroke="oklch(0.27 0 0)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={tickStyle} />
            <YAxis tick={tickStyle} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="leads" stroke="oklch(0.85 0 0)" strokeWidth={2} name="Leads" />
            <Line type="monotone" dataKey="agend" stroke="oklch(0.7 0 0)" strokeWidth={2} name="Agendamentos" />
            <Line type="monotone" dataKey="vendas" stroke="#FF6B00" strokeWidth={2.5} name="Vendas" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Funil de Conversão">
        <div className="space-y-2">
          {funnel.map((f, i) => {
            const prev = i === 0 ? f.value : funnel[i - 1].value;
            const rate = prev > 0 ? Math.round((f.value / prev) * 100) : 0;
            const width = total > 0 ? Math.max(15, (f.value / total) * 100) : 15;
            return (
              <div key={f.name} className="flex items-center gap-4">
                <div className="w-24 text-sm text-muted-foreground">{f.name}</div>
                <div className="flex-1 h-10 bg-secondary rounded-md overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary/70 flex items-center px-3"
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-sm font-semibold text-primary-foreground">
                      {f.value}
                    </span>
                  </div>
                </div>
                <div className="w-16 text-right text-xs text-muted-foreground">
                  {i === 0 ? "—" : `${rate}%`}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Ranking de Serviços (Vendas)">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={svcData} dataKey="count" nameKey="name" outerRadius={90} label>
                {svcData.map((_, i) => (
                  <Cell key={i} fill={SVC_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {svcData.map((s) => (
              <div key={s.name} className="bg-background rounded-md p-2 border border-border">
                <p className="text-xs text-muted-foreground">{s.name}</p>
                <p className="text-sm font-semibold text-primary">{formatBRL(s.revenue)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Desempenho Comercial — Ligações">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={callsData}>
              <CartesianGrid stroke="oklch(0.27 0 0)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={tickStyle} />
              <YAxis tick={tickStyle} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="feitas" fill="oklch(0.7 0 0)" name="Feitas" />
              <Bar dataKey="atendidas" fill="#FF6B00" name="Atendidas" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl p-6">
      <h2 className="text-sm font-semibold mb-4 text-foreground">{title}</h2>
      {children}
    </section>
  );
}
