import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/date-ranges";
import { Plus, Trash2, Phone } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: SettingsPage,
});

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function SettingsPage() {
  const qc = useQueryClient();
  const now = new Date();
  const Y = now.getFullYear();
  const M = now.getMonth() + 1;

  // ---- Goal ----
  const [goal, setGoal] = useState("");
  const goalsQ = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data } = await supabase
        .from("monthly_goals")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      return data ?? [];
    },
  });
  useEffect(() => {
    const current = goalsQ.data?.find((g: any) => g.year === Y && g.month === M);
    if (current) setGoal(String(current.target_amount));
  }, [goalsQ.data, Y, M]);

  async function saveGoal() {
    const v = Number(goal);
    if (!v || v <= 0) return toast.error("Informe um valor válido");
    const { error } = await supabase
      .from("monthly_goals")
      .upsert({ year: Y, month: M, target_amount: v }, { onConflict: "year,month" });
    if (error) return toast.error(error.message);
    toast.success("Meta salva");
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  // ---- Services ----
  const [svcName, setSvcName] = useState("");
  const [svcPrice, setSvcPrice] = useState("");
  const servicesQ = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("*").order("name");
      return data ?? [];
    },
  });

  async function addService() {
    if (!svcName.trim()) return toast.error("Nome obrigatório");
    const { error } = await supabase
      .from("services")
      .insert({ name: svcName.trim(), reference_price: Number(svcPrice) || 0 });
    if (error) return toast.error(error.message);
    setSvcName("");
    setSvcPrice("");
    qc.invalidateQueries({ queryKey: ["services"] });
  }
  async function removeService(id: string) {
    if (!confirm("Remover serviço?")) return;
    await supabase.from("services").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  // ---- Users ----
  const usersQ = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, created_at, user_roles(role)")
        .order("created_at");
      return data ?? [];
    },
  });

  // ---- Calls (quick logger) ----
  const [callDate, setCallDate] = useState(new Date().toISOString().slice(0, 10));
  const [callMade, setCallMade] = useState("");
  const [callAns, setCallAns] = useState("");
  async function saveCalls() {
    const m = Number(callMade) || 0;
    const a = Number(callAns) || 0;
    if (a > m) return toast.error("Atendidas não pode ser maior que feitas");
    const { error } = await supabase
      .from("daily_calls")
      .upsert(
        { date: callDate, calls_made: m, calls_answered: a },
        { onConflict: "date" }
      );
    if (error) return toast.error(error.message);
    toast.success("Ligações registradas");
    setCallMade("");
    setCallAns("");
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
      </header>

      <Section title="Meta de Faturamento">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Meta de {MONTHS[M - 1]}/{Y} (R$)
            </Label>
            <Input
              type="number"
              step="0.01"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="50000"
              className="mt-1.5"
            />
          </div>
          <Button onClick={saveGoal}>Salvar meta</Button>
        </div>
        {!!goalsQ.data?.length && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Histórico
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Meta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goalsQ.data.map((g: any) => (
                  <TableRow key={g.id}>
                    <TableCell>{MONTHS[g.month - 1]}/{g.year}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {formatBRL(Number(g.target_amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="Registrar Ligações do Dia" icon={<Phone className="h-4 w-4 text-primary" />}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Data</Label>
            <Input type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Feitas</Label>
            <Input type="number" value={callMade} onChange={(e) => setCallMade(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Atendidas</Label>
            <Input type="number" value={callAns} onChange={(e) => setCallAns(e.target.value)} className="mt-1.5" />
          </div>
          <Button onClick={saveCalls}>Registrar</Button>
        </div>
      </Section>

      <Section title="Usuários">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Função</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(usersQ.data ?? []).map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/15 text-primary font-medium capitalize">
                    {u.user_roles?.[0]?.role || "comercial"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground mt-3">
          Para adicionar um novo usuário, peça que ele se cadastre na tela de login.
        </p>
      </Section>

      <Section title="Serviços">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 mb-4">
          <Input
            placeholder="Nome do serviço (ex: Clareamento)"
            value={svcName}
            onChange={(e) => setSvcName(e.target.value)}
          />
          <Input
            type="number"
            placeholder="Preço de referência (R$)"
            value={svcPrice}
            onChange={(e) => setSvcPrice(e.target.value)}
          />
          <Button onClick={addService}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead className="text-right">Preço de referência</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(servicesQ.data ?? []).map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-right">{formatBRL(Number(s.reference_price))}</TableCell>
                <TableCell>
                  <button
                    onClick={() => removeService(s.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {!servicesQ.data?.length && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                  Nenhum serviço cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
