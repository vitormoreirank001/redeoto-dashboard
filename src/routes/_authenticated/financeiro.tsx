import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Wallet,
  TrendingUp,
  ShieldAlert,
  DollarSign,
  Receipt,
  Percent,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, saleDay, toLocalISO } from "@/lib/date-ranges";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUserRole } from "@/hooks/use-user-role";
import { PageContainer } from "@/components/page-container";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { CHART_COLORS } from "@/lib/chart-colors";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/financeiro")({
  component: FinanceiroPage,
});

const CATEGORIES = ["aluguel", "material", "marketing", "salarios", "equipamentos", "outros"];
const CATEGORY_LABEL: Record<string, string> = {
  aluguel: "Aluguel",
  material: "Material",
  marketing: "Marketing",
  salarios: "Salários",
  equipamentos: "Equipamentos",
  outros: "Outros",
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function FinanceiroPage() {
  const { isAdmin, isLoading } = useUserRole();
  if (isLoading) return null;
  if (!isAdmin) {
    return (
      <PageContainer>
        <div className="bg-card border border-border rounded-xl shadow-sm p-8 text-center max-w-md mx-auto">
          <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Apenas administradores podem acessar o Financeiro.
          </p>
        </div>
      </PageContainer>
    );
  }
  return <FinanceiroContent />;
}

function FinanceiroContent() {
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("outros");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(toLocalISO(new Date()));

  const expensesQ = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false });
      return data ?? [];
    },
  });

  const leadsQ = useQuery({
    queryKey: ["leads_finance"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("entry_date,closed_at,budget_amount,stage")
        .eq("stage", "fechado");
      return data ?? [];
    },
  });

  async function addExpense() {
    if (!description.trim()) return toast.error("Descrição obrigatória");
    if (!amount || Number(amount) <= 0) return toast.error("Informe um valor válido");
    const { error } = await supabase.from("expenses").insert({
      description: description.trim(),
      category,
      amount: Number(amount),
      expense_date: expenseDate,
    });
    if (error) return toast.error(error.message);
    setDescription("");
    setAmount("");
    qc.invalidateQueries({ queryKey: ["expenses"] });
  }

  async function removeExpense(id: string) {
    if (!confirm("Remover este custo?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["expenses"] });
  }

  const dre = useMemo(() => {
    const leads = leadsQ.data ?? [];
    const expenses = expensesQ.data ?? [];
    const byMonth: Record<string, { receita: number; custo: number }> = {};

    function bucket(key: string) {
      if (!byMonth[key]) byMonth[key] = { receita: 0, custo: 0 };
      return byMonth[key];
    }

    leads.forEach((l: any) => {
      // Receita entra no mês em que a venda FECHOU, não no mês em que o lead entrou.
      const key = saleDay(l).slice(0, 7);
      bucket(key).receita += Number(l.budget_amount || 0);
    });
    expenses.forEach((e: any) => {
      const key = e.expense_date.slice(0, 7);
      bucket(key).custo += Number(e.amount || 0);
    });

    return Object.entries(byMonth)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 12)
      .map(([key, v]) => {
        const [y, m] = key.split("-");
        const lucro = v.receita - v.custo;
        const margem = v.receita > 0 ? (lucro / v.receita) * 100 : 0;
        return {
          key,
          label: `${MONTHS[Number(m) - 1]}/${y}`,
          receita: v.receita,
          custo: v.custo,
          lucro,
          margem,
        };
      });
  }, [leadsQ.data, expensesQ.data]);

  // dre vem do mais recente pro mais antigo — chart precisa do sentido cronológico.
  const cashflowData = [...dre].reverse();

  const current = dre[0];
  const previous = dre[1];
  function pctChange(now: number, before: number | undefined) {
    if (!before) return null;
    return ((now - before) / Math.abs(before)) * 100;
  }
  const receitaChange = current ? pctChange(current.receita, previous?.receita) : null;
  const custoChange = current ? pctChange(current.custo, previous?.custo) : null;
  const lucroChange = current ? pctChange(current.lucro, previous?.lucro) : null;
  const margemChange = current && previous ? current.margem - previous.margem : null;

  return (
    <PageContainer className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">Custos e resultado mensal (DRE)</p>
      </header>

      {current && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            title="Receita"
            icon={DollarSign}
            value={formatBRL(current.receita)}
            change={receitaChange}
            goodWhenUp
          />
          <Stat
            title="Custo"
            icon={Receipt}
            value={formatBRL(current.custo)}
            change={custoChange}
            goodWhenUp={false}
          />
          <Stat
            title="Lucro"
            icon={Wallet}
            value={formatBRL(current.lucro)}
            change={lucroChange}
            goodWhenUp
          />
          <Stat
            title="Margem"
            icon={Percent}
            value={`${current.margem.toFixed(0)}%`}
            change={margemChange}
            changeIsPoints
            goodWhenUp
          />
        </div>
      )}

      {cashflowData.length > 1 && (
        <section className="bg-card border border-border rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold mb-3">Receita × Custo</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={cashflowData}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }} />
              <YAxis tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: CHART_COLORS.tooltipBg,
                  border: `1px solid ${CHART_COLORS.tooltipBorder}`,
                  borderRadius: 8,
                  color: CHART_COLORS.tooltipText,
                }}
                formatter={(v: number) => formatBRL(v)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="receita"
                name="Receita"
                stroke={CHART_COLORS.ember}
                fill={CHART_COLORS.ember}
                fillOpacity={0.15}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="custo"
                name="Custo"
                stroke={CHART_COLORS.frio}
                fill={CHART_COLORS.frio}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      )}

      <section className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> DRE — Receita, Custo e Lucro por mês
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead className="text-right">Receita</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead className="text-right">Lucro</TableHead>
              <TableHead className="text-right">Margem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dre.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="text-right">{formatBRL(row.receita)}</TableCell>
                <TableCell className="text-right text-destructive">
                  {formatBRL(row.custo)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-semibold",
                    row.lucro >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {formatBRL(row.lucro)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {row.margem.toFixed(0)}%
                </TableCell>
              </TableRow>
            ))}
            {!dre.length && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState message="Sem dados ainda — feche uma venda ou lance um custo pra começar." />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> Lançar custo
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_0.8fr_1fr_auto] gap-3 items-end mb-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Descrição
            </Label>
            <Input
              className="mt-1.5"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Aluguel de junho"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Categoria
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Valor (R$)
            </Label>
            <Input
              className="mt-1.5"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Data</Label>
            <Input
              className="mt-1.5"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>
          <Button onClick={addExpense}>
            <Plus className="h-4 w-4 mr-2" /> Lançar
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(expensesQ.data ?? []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.description}</TableCell>
                <TableCell className="text-muted-foreground">
                  {CATEGORY_LABEL[e.category] || e.category}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(e.expense_date).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">{formatBRL(Number(e.amount))}</TableCell>
                <TableCell>
                  <button
                    onClick={() => removeExpense(e.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {!expensesQ.data?.length && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState
                    icon={Receipt}
                    message="Nenhum custo lançado ainda — use o formulário acima."
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </PageContainer>
  );
}
