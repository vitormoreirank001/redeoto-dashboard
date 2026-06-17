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
import { Plus, Trash2, Wallet, TrendingUp, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/date-ranges";
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
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        <div className="bg-card border border-border rounded-xl shadow-sm p-8 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Apenas administradores podem acessar o Financeiro.
          </p>
        </div>
      </div>
    );
  }
  return <FinanceiroContent />;
}

function FinanceiroContent() {
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("outros");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));

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
        .select("entry_date,budget_amount,stage")
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
      const key = l.entry_date.slice(0, 7);
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

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-5xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">Custos e resultado mensal (DRE)</p>
      </header>

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
                    row.lucro >= 0 ? "text-[#16A34A]" : "text-destructive",
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
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  Sem dados ainda.
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
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  Nenhum custo lançado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
