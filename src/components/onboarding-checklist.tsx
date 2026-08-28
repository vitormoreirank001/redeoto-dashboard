import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Circle, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "onboarding_checklist_dismissed";

/**
 * Checklist de primeiro acesso do admin — como o cadastro é fechado (só o
 * admin cria conta), "onboarding" aqui é um convite a terminar a configuração
 * inicial, não um funil público. Some sozinho quando os itens detectáveis
 * (marca, equipe) estiverem prontos, ou se o admin dispensar manualmente.
 */
export function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const { data: settings } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("logo_url")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
  });

  const { data: teamSize } = useQuery({
    queryKey: ["profiles_count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });
      return count ?? 1;
    },
  });

  const hasLogo = !!settings?.logo_url;
  const hasTeam = (teamSize ?? 1) > 1;

  if (dismissed || (hasLogo && hasTeam)) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  const items = [
    { done: hasLogo, label: "Adicione sua marca", detail: "Logo aparece na sidebar e no login" },
    { done: hasTeam, label: "Convide sua equipe", detail: "Crie o acesso de quem vai usar o CRM" },
    {
      done: false,
      label: "Confira os horários de atendimento",
      detail: "Usados na Agenda antes de divulgar o link de WhatsApp",
    },
  ];

  return (
    <section className="rounded-2xl bg-card border border-border shadow-sm p-5 relative">
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        title="Dispensar"
      >
        <X className="h-4 w-4" />
      </button>
      <h2 className="text-sm font-semibold mb-1">Termine de configurar o VCP Sistema</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Poucos passos antes de colocar sua equipe pra trabalhar por aqui.
      </p>
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.label}
            to="/configuracoes"
            className="flex items-center gap-2.5 rounded-lg p-2 -mx-2 hover:bg-secondary/60 transition-colors"
          >
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            )}
            <div className="min-w-0">
              <p className={cn("text-sm", item.done && "text-muted-foreground line-through")}>
                {item.label}
              </p>
              <p className="text-[11px] text-muted-foreground">{item.detail}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
