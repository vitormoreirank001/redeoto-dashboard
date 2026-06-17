import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, KanbanSquare, LineChart, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useUserRole } from "@/hooks/use-user-role";

const navItems = [
  {
    to: "/dashboard",
    label: "Dashboard",
    shortLabel: "Início",
    icon: LayoutDashboard,
    adminOnly: false,
  },
  { to: "/crm", label: "CRM", shortLabel: "CRM", icon: KanbanSquare, adminOnly: false },
  {
    to: "/estatisticas",
    label: "Estatísticas",
    shortLabel: "Stats",
    icon: LineChart,
    adminOnly: false,
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    shortLabel: "Config",
    icon: Settings,
    adminOnly: true,
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useUserRole();
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const [userName, setUserName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserEmail(data.user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      setUserName(profile?.full_name || data.user.email?.split("@")[0] || "Usuário");
    })();
    supabase
      .from("app_settings")
      .select("logo_url")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setLogoUrl(data?.logo_url ?? null));
  }, []);

  async function handleLogout() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="hidden lg:flex w-64 shrink-0 bg-sidebar border-r border-sidebar-border flex-col">
        <div className="px-6 py-6 border-b border-sidebar-border">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-9 max-w-[160px] object-contain" />
          ) : (
            <h1 className="text-xl font-extrabold tracking-tight">
              <span className="text-primary">Managed</span>
              <span className="text-sidebar-foreground">Dentista</span>
            </h1>
          )}
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-1">Painel</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-sidebar-foreground hover:bg-secondary",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
              {(userName || "U").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Topo fixo no celular/tablet — logo + sair, navegação fica na barra inferior */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-4 bg-sidebar border-b border-sidebar-border">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-7 max-w-[140px] object-contain" />
        ) : (
          <h1 className="text-base font-extrabold tracking-tight">
            <span className="text-primary">Managed</span>
            <span className="text-sidebar-foreground">Dentista</span>
          </h1>
        )}
        <button
          onClick={handleLogout}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          title="Sair"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <main className="flex-1 overflow-x-hidden pt-14 pb-16 lg:pt-0 lg:pb-0">{children}</main>

      {/* Navegação inferior fixa no celular/tablet */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch bg-sidebar border-t border-sidebar-border">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              {item.shortLabel}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
