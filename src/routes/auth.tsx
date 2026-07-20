import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

// SEGURANÇA: cadastro público removido de propósito. Este é um painel interno —
// novos usuários são criados apenas por um admin em Configurações (Edge Function
// admin-create-user, que valida has_role('admin')). Manter também "Allow new users
// to sign up" DESLIGADO em Supabase → Authentication → Providers.
function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
    supabase
      .from("app_settings")
      .select("logo_url")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setLogoUrl(data?.logo_url ?? null));
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPass,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo!");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-12 max-w-[220px] object-contain mx-auto" />
          ) : (
            <h1 className="text-3xl font-extrabold tracking-tight">
              <span className="text-primary">Managed</span>
              <span className="text-foreground">Dentista</span>
            </h1>
          )}
          <p className="text-sm text-muted-foreground mt-2">Painel Administrativo</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl shadow-black/5">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="voce@redeoto.com.br"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">
            Acesso restrito à equipe. Novos usuários são cadastrados pelo administrador.
          </p>
        </div>
      </div>
    </div>
  );
}
