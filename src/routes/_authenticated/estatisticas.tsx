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
import { formatBRL, saleDay } from "@/lib/date-ranges";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

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

type TxSortKey = "name" | "service" | "amount" | "date";

function StatsPage() {
  const [range, setRange] = useState<Range>("30d");
  const [txSearch, setTxSearch] = useState("");
  const [txSort, setTxSort] = useState<{ key: TxSortKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });

  const { data } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      // Sem telefone/notas/histórico (PII que esta tela não precisa). "name" entrou
      // de propósito pra tabela de Transações identificar quem é a venda/negociação.
      const leadsR = await supabase
        .from("leads")
        .select(
          "id,name,entry_date,appointment_date,stage,service,budget_amount,checklist,calls,closed_at,stage_changed_at",
        );
      return { leads: leadsR.data ?? [] };
    },
  });

  const start = rangeStart(range);
  const startDay = start.toISOString().slice(0, 10);

  // Captação (funil, leads/dia): leads que ENTRARAM no período.
  const leads = (data?.leads ?? []).filter((l: any) => new Date(l.entry_date) >= start);
  const entryDay = (l: any) => l.entry_date.slice(0, 10);

  // Vendas: leads que FECHARAM no período, independente de quando entraram.
  // Um lead de junho que fechou em julho é venda de julho e precisa aparecer aqui.
  const salesInRange = (data?.leads ?? []).filter(
    (l: any) => l.stage === "fechado" && saleDay(l) >= startDay,
  );

  const series = useMemo(() => {
    const days: Record<string, { date: string; leads: number; agend: number; vendas: number }> = {};
    const end = new Date();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      days[k] = { date: k, leads: 0, agend: 0, vendas: 0 };
    }
    leads.forEach((l: any) => {
      const k = entryDay(l);
      if (days[k]) days[k].leads++;
      const apptDay = l.appointment_date?.slice(0, 10);
      if (apptDay && days[apptDay]) days[apptDay].agend++;
    });
    salesInRange.forEach((l: any) => {
      const k = saleDay(l);
      if (days[k]) days[k].vendas++;
    });
    return Object.values(days).map((d) => ({
      ...d,
      label: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    }));
  }, [leads, salesInRange, start]);

  // Funnel
  const total = leads.length;
  const contato = leads.filter(
    (l: any) =>
      l.checklist?.primeiro_contato ||
      ["contato", "agendado", "orcamento", "followup", "fechado"].includes(l.stage),
  ).length;
  const agendado = leads.filter(
    (l: any) =>
      l.appointment_date || ["agendado", "orcamento", "followup", "fechado"].includes(l.stage),
  ).length;
  const avaliacao = leads.filter((l: any) => l.checklist?.avaliacao_realizada).length;
  const orcamento = leads.filter(
    (l: any) => l.checklist?.orcamento_apresentado || ["orcamento", "fechado"].includes(l.stage),
  ).length;
  // Venda usa o mesmo critério de saleDay (fechamento) do resto da tela — não
  // entry_date. Senão um lead que entrou fora do período mas fechou dentro dele
  // conta em "Vendas"/faturamento mas some do funil (e vice-versa).
  const venda = salesInRange.length;

  const funnel = [
    { name: "Leads", value: total },
    { name: "Contato", value: contato },
    { name: "Agendado", value: agendado },
    { name: "Avaliação", value: avaliacao },
    { name: "Orçamento", value: orcamento },
    { name: "Venda", value: venda },
  ];

  // Services breakdown — "service" virou texto livre, então agrupa pelo nome
  // real digitado e dobra qualquer coisa além das 4 maiores em "Outros"
  // (nunca gera uma cor nova pra série — regra de paleta categórica fixa).
  const svcMap: Record<string, { count: number; revenue: number }> = {};
  salesInRange.forEach((l: any) => {
    const key = (l.service || "").trim() || "Outros";
    svcMap[key] = svcMap[key] || { count: 0, revenue: 0 };
    svcMap[key].count++;
    svcMap[key].revenue += Number(l.budget_amount || 0);
  });
  const svcSorted = Object.entries(svcMap).sort((a, b) => b[1].revenue - a[1].revenue);
  const svcTop = svcSorted.slice(0, 4);
  const svcRest = svcSorted.slice(4);
  const svcData = svcTop.map(([name, v]) => ({ name, count: v.count, revenue: v.revenue }));
  if (svcRest.length > 0) {
    const folded = svcRest.reduce(
      (acc, [, v]) => ({ count: acc.count + v.count, revenue: acc.revenue + v.revenue }),
      { count: 0, revenue: 0 },
    );
    svcData.push({ name: "Outros", count: folded.count, revenue: folded.revenue });
  }

  // Transações: leads com valor em jogo (fechado/perdido/orçamento/follow-up),
  // linha a linha, dentro do mesmo período selecionado no topo da página.
  const TX_STATUS: Record<string, { label: string; cls: string }> = {
    fechado: { label: "Concluído", cls: "bg-success/15 text-[#16A34A]" },
    perdido: { label: "Perdido", cls: "bg-destructive/15 text-destructive" },
    orcamento: { label: "Pendente", cls: "bg-warning/15 text-[#D97706]" },
    followup: { label: "Pendente", cls: "bg-warning/15 text-[#D97706]" },
  };
  const transactions = (data?.leads ?? [])
    .filter((l: any) => Number(l.budget_amount) > 0 && TX_STATUS[l.stage])
    .map((l: any) => ({
      id: l.id as string,
      name: l.name as string,
      service: (l.service as string)?.trim() || "—",
      amount: Number(l.budget_amount || 0),
      date: l.stage === "fechado" ? saleDay(l) : (l.stage_changed_at as string).slice(0, 10),
      status: TX_STATUS[l.stage],
    }))
    .filter((t) => t.date >= startDay)
    .filter(
      (t) => !txSearch.trim() || t.name.toLowerCase().includes(txSearch.trim().toLowerCase()),
    );

  const txDir = txSort.dir === "asc" ? 1 : -1;
  const sortedTransactions = [...transactions].sort((a, b) => {
    if (txSort.key === "amount") return (a.amount - b.amount) * txDir;
    if (txSort.key === "date") return a.date.localeCompare(b.date) * txDir;
    return a[txSort.key].localeCompare(b[txSort.key]) * txDir;
  });

  function toggleTxSort(key: TxSortKey) {
    setTxSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
  }

  function exportTransactionsCsv() {
    const header = ["Cliente", "Serviço", "Valor", "Data", "Status"];
    const rows = sortedTransactions.map((t) => [
      t.name,
      t.service,
      t.amount.toFixed(2),
      t.date,
      t.status.label,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transacoes-${startDay}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Calls (agregadas por dia a partir da data/hora real de cada ligação registrada,
  // não a data de entrada do lead — um lead antigo pode receber uma ligação hoje)
  const callsByDay: Record<string, { calls_made: number; calls_answered: number }> = {};
  (data?.leads ?? []).forEach((l: any) => {
    (l.calls ?? []).forEach((c: { at: string; answered: boolean }) => {
      const k = c.at.slice(0, 10);
      if (k < start.toISOString().slice(0, 10)) return;
      if (!callsByDay[k]) callsByDay[k] = { calls_made: 0, calls_answered: 0 };
      callsByDay[k].calls_made += 1;
      if (c.answered) callsByDay[k].calls_answered += 1;
    });
  });
  const callsData = Object.entries(callsByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, c]) => ({
      label: new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      feitas: c.calls_made,
      atendidas: c.calls_answered,
    }));

  const tickStyle = { fill: "#64748B", fontSize: 11 };
  const tooltipStyle = {
    backgroundColor: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    color: "#0F172A",
  };

  // Paleta categórica fixa do app (--chart-1..5) — ordem fixa, nunca cíclica.
  const SVC_COLORS = ["#1B4FD8", "#64748B", "#16A34A", "#D97706", "#7C3AED"];

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1600px] mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Estatísticas</h1>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {(["today", "7d", "30d", "month"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md font-medium transition-colors",
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r === "today"
                ? "Hoje"
                : r === "7d"
                  ? "7 dias"
                  : r === "30d"
                    ? "30 dias"
                    : "Este mês"}
            </button>
          ))}
        </div>
      </header>

      <Card title="Tendências">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={series}>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={tickStyle} />
            <YAxis tick={tickStyle} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="leads" stroke="#94A3B8" strokeWidth={2} name="Leads" />
            <Line
              type="monotone"
              dataKey="agend"
              stroke="#0EA5E9"
              strokeWidth={2}
              name="Agendamentos"
            />
            <Line
              type="monotone"
              dataKey="vendas"
              stroke="#1B4FD8"
              strokeWidth={2.5}
              name="Vendas"
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Funil de Conversão">
        <div className="space-y-2">
          {funnel.map((f, i) => {
            const prev = i === 0 ? f.value : funnel[i - 1].value;
            const rate = prev > 0 ? Math.min(100, Math.round((f.value / prev) * 100)) : 0;
            const width = total > 0 ? Math.min(100, Math.max(15, (f.value / total) * 100)) : 15;
            return (
              <div key={f.name} className="flex items-center gap-4">
                <div className="w-24 text-sm text-muted-foreground">{f.name}</div>
                <div className="flex-1 h-10 bg-secondary rounded-md overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary/70 flex items-center px-3"
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-sm font-semibold text-primary-foreground">{f.value}</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-center">
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
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={tickStyle} />
              <YAxis tick={tickStyle} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="feitas" fill="#94A3B8" name="Feitas" />
              <Bar dataKey="atendidas" fill="#1B4FD8" name="Atendidas" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Transações">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              placeholder="Procurar por cliente..."
              className="pl-8 h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={exportTransactionsCsv}>
            <Download className="h-3.5 w-3.5 mr-2" /> Exportar CSV
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Cliente" sortKey="name" current={txSort} onSort={toggleTxSort} />
                <SortableHead
                  label="Serviço"
                  sortKey="service"
                  current={txSort}
                  onSort={toggleTxSort}
                />
                <SortableHead
                  label="Valor"
                  sortKey="amount"
                  current={txSort}
                  onSort={toggleTxSort}
                  align="right"
                />
                <SortableHead label="Data" sortKey="date" current={txSort} onSort={toggleTxSort} />
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTransactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma transação neste período.
                  </TableCell>
                </TableRow>
              )}
              {sortedTransactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">{t.service}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">
                    {formatBRL(t.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(t.date + "T00:00:00").toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        t.status.cls,
                      )}
                    >
                      {t.status.label}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  current,
  onSort,
  align,
}: {
  label: string;
  sortKey: TxSortKey;
  current: { key: TxSortKey; dir: "asc" | "desc" };
  onSort: (key: TxSortKey) => void;
  align?: "right";
}) {
  const active = current.key === sortKey;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          active && "text-foreground",
        )}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    </TableHead>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl shadow-sm p-5">
      <h2 className="text-sm font-semibold mb-3 text-foreground">{title}</h2>
      {children}
    </section>
  );
}
