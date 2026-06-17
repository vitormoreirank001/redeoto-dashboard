import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/estoque")({
  component: EstoquePage,
});

interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  expiry_date: string | null;
  notes: string | null;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryBadge(expiryDate: string | null) {
  if (!expiryDate) {
    return { text: "Sem validade", cls: "bg-muted text-muted-foreground" };
  }
  const d = daysUntil(expiryDate);
  if (d <= 1) {
    return {
      text: d < 0 ? "Vencido" : d === 0 ? "Vence hoje" : "Vence amanhã",
      cls: "bg-destructive/15 text-destructive",
    };
  }
  if (d <= 4) {
    return { text: `Vence em ${d} dias`, cls: "bg-warning/15 text-[#D97706]" };
  }
  return { text: `Vence em ${d} dias`, cls: "bg-success/15 text-[#16A34A]" };
}

function EstoquePage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("un");
  const [expiryDate, setExpiryDate] = useState("");

  const itemsQ = useQuery({
    queryKey: ["inventory_items"],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("*")
        .order("expiry_date", { ascending: true, nullsFirst: false });
      return (data ?? []) as InventoryItem[];
    },
  });

  const items = itemsQ.data ?? [];
  const expiringSoon = items.filter((i) => i.expiry_date && daysUntil(i.expiry_date) <= 4).length;

  async function addItem() {
    if (!name.trim()) return toast.error("Nome do produto é obrigatório");
    const { error } = await supabase.from("inventory_items").insert({
      name: name.trim(),
      category: category.trim() || null,
      quantity: Number(quantity) || 0,
      unit: unit.trim() || "un",
      expiry_date: expiryDate || null,
    });
    if (error) return toast.error(error.message);
    setName("");
    setCategory("");
    setQuantity("");
    setUnit("un");
    setExpiryDate("");
    qc.invalidateQueries({ queryKey: ["inventory_items"] });
  }

  async function removeItem(id: string) {
    if (!confirm("Remover este produto do estoque?")) return;
    await supabase.from("inventory_items").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["inventory_items"] });
  }

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-5xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Estoque</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">Produtos e validade</p>
      </header>

      {expiringSoon > 0 && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive font-medium">
            {expiringSoon} produto(s) vencendo em até 4 dias.
          </p>
        </div>
      )}

      <section className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" /> Adicionar produto
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_0.8fr_0.6fr_1fr_auto] gap-3 items-end">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nome</Label>
            <Input
              className="mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Resina composta"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Categoria
            </Label>
            <Input
              className="mt-1.5"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Material"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Qtd.</Label>
            <Input
              className="mt-1.5"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unid.</Label>
            <Input className="mt-1.5" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Validade
            </Label>
            <Input
              className="mt-1.5"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          <Button onClick={addItem}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar
          </Button>
        </div>
      </section>

      <section className="bg-card border border-border rounded-xl shadow-sm p-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const badge = expiryBadge(item.expiry_date);
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.category || "—"}</TableCell>
                  <TableCell className="text-right">
                    {item.quantity} {item.unit}
                  </TableCell>
                  <TableCell>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", badge.cls)}>
                      {badge.text}
                    </span>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!items.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  Nenhum produto cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
