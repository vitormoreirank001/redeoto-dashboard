import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/date-ranges";
import { getTheme, setTheme as persistTheme, type Theme } from "@/lib/theme";
import {
  Plus,
  Trash2,
  Image as ImageIcon,
  Moon,
  ListPlus,
  SlidersHorizontal,
  UserPlus,
  MessageCircle,
  Copy,
  ShieldAlert,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUserRole } from "@/hooks/use-user-role";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: SettingsPage,
});

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function SettingsPage() {
  const { isAdmin, isLoading: roleLoading } = useUserRole();

  if (roleLoading) return null;

  if (!isAdmin) {
    return (
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        <div className="bg-card border border-border rounded-xl shadow-sm p-8 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Apenas administradores podem acessar Configurações.
          </p>
        </div>
      </div>
    );
  }

  return <SettingsContent />;
}

function SettingsContent() {
  const qc = useQueryClient();
  const now = new Date();
  const Y = now.getFullYear();
  const M = now.getMonth() + 1;

  // ---- Branding (logo) ----
  const [uploading, setUploading] = useState(false);
  const settingsQ = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("logo_url,whatsapp_webhook_token,whatsapp_connected_at")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
  });

  async function uploadLogo(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("branding").upload(path, file, {
      upsert: true,
    });
    if (upErr) {
      setUploading(false);
      return toast.error(upErr.message);
    }
    const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
    const { error } = await supabase
      .from("app_settings")
      .update({ logo_url: pub.publicUrl })
      .eq("id", true);
    setUploading(false);
    if (error) return toast.error(error.message);
    toast.success("Logo atualizada");
    qc.invalidateQueries({ queryKey: ["app_settings"] });
  }

  // ---- Theme ----
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    setThemeState(getTheme());
  }, []);
  function toggleTheme(checked: boolean) {
    const next: Theme = checked ? "dark" : "light";
    setThemeState(next);
    persistTheme(next);
  }

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

  // ---- Field options (Mídia / Origem) ----
  const fieldOptionsQ = useQuery({
    queryKey: ["field_options"],
    queryFn: async () => {
      const { data } = await supabase.from("field_options").select("*").order("sort_order");
      return data ?? [];
    },
  });

  async function addOption(fieldKey: string, value: string) {
    if (!value.trim()) return;
    const count = (fieldOptionsQ.data ?? []).filter((o: any) => o.field_key === fieldKey).length;
    const { error } = await supabase
      .from("field_options")
      .insert({ field_key: fieldKey, value: value.trim(), sort_order: count });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["field_options"] });
  }
  async function removeOption(id: string) {
    await supabase.from("field_options").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["field_options"] });
  }

  // ---- Custom fields ----
  const [cfLabel, setCfLabel] = useState("");
  const [cfType, setCfType] = useState("text");
  const [cfOptions, setCfOptions] = useState("");
  const customFieldsQ = useQuery({
    queryKey: ["custom_fields"],
    queryFn: async () => {
      const { data } = await supabase.from("custom_fields").select("*").order("sort_order");
      return data ?? [];
    },
  });

  async function addCustomField() {
    if (!cfLabel.trim()) return toast.error("Nome do campo obrigatório");
    const key = cfLabel
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const options =
      cfType === "select"
        ? cfOptions
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : [];
    const count = (customFieldsQ.data ?? []).length;
    const { error } = await supabase.from("custom_fields").insert({
      key,
      label: cfLabel.trim(),
      field_type: cfType,
      options,
      sort_order: count,
    });
    if (error) return toast.error(error.message);
    setCfLabel("");
    setCfOptions("");
    setCfType("text");
    qc.invalidateQueries({ queryKey: ["custom_fields"] });
  }
  async function removeCustomField(id: string) {
    if (!confirm("Remover campo personalizado? Os dados já salvos nos leads não serão apagados."))
      return;
    await supabase.from("custom_fields").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["custom_fields"] });
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

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("comercial");
  const [creatingUser, setCreatingUser] = useState(false);

  async function createUser() {
    if (!newName.trim() || !newEmail.trim() || newPassword.length < 6) {
      return toast.error("Preencha nome, e-mail e uma senha com 6+ caracteres");
    }
    setCreatingUser(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        full_name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      },
    });
    setCreatingUser(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error || error?.message || "Erro ao criar usuário");
    }
    toast.success("Usuário criado");
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewRole("comercial");
    qc.invalidateQueries({ queryKey: ["profiles"] });
  }

  const webhookUrl = settingsQ.data
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook?token=${settingsQ.data.whatsapp_webhook_token}`
    : "";
  function copyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada");
  }

  const midiaOptions = (fieldOptionsQ.data ?? []).filter((o: any) => o.field_key === "midia");
  const origemOptions = (fieldOptionsQ.data ?? []).filter((o: any) => o.field_key === "origem");

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-5xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      </header>

      <Section title="Marca" icon={<ImageIcon className="h-4 w-4 text-primary" />}>
        <div className="flex items-center gap-4 flex-wrap">
          {settingsQ.data?.logo_url ? (
            <img
              src={settingsQ.data.logo_url}
              alt="Logo atual"
              className="h-12 max-w-[200px] object-contain bg-background border border-border rounded-lg p-2"
            />
          ) : (
            <div className="h-12 w-32 flex items-center justify-center bg-background border border-dashed border-border rounded-lg text-xs text-muted-foreground">
              Sem logo
            </div>
          )}
          <div>
            <input
              id="logo-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadLogo(file);
              }}
            />
            <Label htmlFor="logo-input">
              <Button asChild variant="outline" disabled={uploading}>
                <span>{uploading ? "Enviando..." : "Trocar logo"}</span>
              </Button>
            </Label>
            <p className="text-xs text-muted-foreground mt-1.5">
              Aparece na sidebar e na tela de login. Sem logo, mostra o texto "ManagedDentista".
            </p>
          </div>
        </div>
      </Section>

      <Section title="Aparência" icon={<Moon className="h-4 w-4 text-primary" />}>
        <div className="flex items-center justify-between max-w-sm">
          <div>
            <p className="text-sm font-medium">Tema escuro</p>
            <p className="text-xs text-muted-foreground">
              Aplica para todos que acessarem deste navegador
            </p>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
        </div>
      </Section>

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
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Histórico</p>
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
                    <TableCell>
                      {MONTHS[g.month - 1]}/{g.year}
                    </TableCell>
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

      <Section title="Mídia" icon={<ListPlus className="h-4 w-4 text-primary" />}>
        <p className="text-xs text-muted-foreground mb-3">
          Canais disponíveis para o campo "Mídia" no card do lead (Instagram, Facebook...).
        </p>
        <OptionList
          fieldKey="midia"
          options={midiaOptions}
          onAdd={(v) => addOption("midia", v)}
          onRemove={removeOption}
        />
      </Section>

      <Section title="Origem" icon={<ListPlus className="h-4 w-4 text-primary" />}>
        <p className="text-xs text-muted-foreground mb-3">
          Como o lead chegou até a clínica (WhatsApp, Formulário, Fluxo de loja...).
        </p>
        <OptionList
          fieldKey="origem"
          options={origemOptions}
          onAdd={(v) => addOption("origem", v)}
          onRemove={removeOption}
        />
      </Section>

      <Section
        title="Campos personalizados"
        icon={<SlidersHorizontal className="h-4 w-4 text-primary" />}
      >
        <p className="text-xs text-muted-foreground mb-3">
          Campos extras exibidos no card do lead. Crie quantos precisar.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_auto] gap-3 mb-4">
          <Input
            placeholder="Nome do campo (ex: Plano de saúde)"
            value={cfLabel}
            onChange={(e) => setCfLabel(e.target.value)}
          />
          <Select value={cfType} onValueChange={setCfType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Texto</SelectItem>
              <SelectItem value="number">Número</SelectItem>
              <SelectItem value="boolean">Sim/Não</SelectItem>
              <SelectItem value="select">Lista de opções</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Opções separadas por vírgula (se Lista)"
            value={cfOptions}
            onChange={(e) => setCfOptions(e.target.value)}
            disabled={cfType !== "select"}
          />
          <Button onClick={addCustomField}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(customFieldsQ.data ?? []).map((f: any) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.label}</TableCell>
                <TableCell className="text-muted-foreground capitalize">{f.field_type}</TableCell>
                <TableCell>
                  <button
                    onClick={() => removeCustomField(f.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {!customFieldsQ.data?.length && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                  Nenhum campo personalizado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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

        <div className="mt-5 pt-4 border-t border-border">
          <p className="text-sm font-medium mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> Novo usuário
          </p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_140px_auto] gap-3">
            <Input
              placeholder="Nome completo"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              type="email"
              placeholder="E-mail"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Senha provisória"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comercial">Comercial</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={createUser} disabled={creatingUser}>
              {creatingUser ? "Criando..." : "Criar"}
            </Button>
          </div>
        </div>
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

      <Section title="Integrações" icon={<MessageCircle className="h-4 w-4 text-primary" />}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-success/15 text-success flex items-center justify-center shrink-0">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-sm">WhatsApp — Redeoto</h3>
              <span
                className={
                  settingsQ.data?.whatsapp_connected_at
                    ? "text-xs px-2 py-0.5 rounded-full bg-success/15 text-success font-medium"
                    : "text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium"
                }
              >
                {settingsQ.data?.whatsapp_connected_at
                  ? "Conectado"
                  : "Aguardando primeira mensagem"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Envie essa URL para a agência configurar o webhook da integração de WhatsApp.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-2 truncate">
                {webhookUrl || "Gerando..."}
              </code>
              <Button size="sm" variant="outline" onClick={copyWebhookUrl} disabled={!webhookUrl}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            {settingsQ.data?.whatsapp_connected_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Último evento recebido:{" "}
                {new Date(settingsQ.data.whatsapp_connected_at).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

function OptionList({
  options,
  onAdd,
  onRemove,
}: {
  fieldKey: string;
  options: { id: string; value: string }[];
  onAdd: (value: string) => void;
  onRemove: (id: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div>
      <div className="flex gap-2 mb-3">
        <Input
          placeholder="Adicionar opção..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd(value);
              setValue("");
            }
          }}
        />
        <Button
          variant="secondary"
          onClick={() => {
            onAdd(value);
            setValue("");
          }}
        >
          Adicionar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <span
            key={o.id}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-secondary text-foreground"
          >
            {o.value}
            <button
              onClick={() => onRemove(o.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!options.length && (
          <span className="text-xs text-muted-foreground">Nenhuma opção cadastrada.</span>
        )}
      </div>
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
    <section className="bg-card border border-border rounded-xl shadow-sm p-5">
      <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
