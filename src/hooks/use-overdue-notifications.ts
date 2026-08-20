import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isOverdue } from "@/lib/lead-sla";
import { useLeads } from "@/hooks/use-leads";

/**
 * Toast (sempre) + notificação push do navegador (só com a aba em segundo
 * plano) quando a contagem de leads atrasados AUMENTA. Liga/desliga em
 * Configurações > Notificações (app_settings.notify_overdue_leads).
 */
export function useOverdueNotifications() {
  const { data: leads } = useLeads();

  const { data: settings } = useQuery({
    queryKey: ["app_settings_notify"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("notify_overdue_leads")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
  });

  const lastSeenCount = useRef<number | null>(null);

  useEffect(() => {
    if (!settings?.notify_overdue_leads || !leads) return;

    const overdueCount = leads.filter(isOverdue).length;
    const prev = lastSeenCount.current;
    lastSeenCount.current = overdueCount;

    // Primeira leitura da sessão: avisa se já existe atraso, mas não conta
    // como "aumento" pra não dar dois avisos em sequência no primeiro load.
    if (prev === null) {
      if (overdueCount > 0) {
        toast.warning(
          overdueCount === 1
            ? "1 lead atrasado sem contato"
            : `${overdueCount} leads atrasados sem contato`,
          { description: "Ver fila em Dashboard ou CRM." },
        );
      }
      return;
    }

    if (overdueCount <= prev) return;

    toast.warning(
      overdueCount === 1
        ? "1 lead atrasado sem contato"
        : `${overdueCount} leads atrasados sem contato`,
      { description: "Ver fila em Dashboard ou CRM." },
    );

    if (
      document.visibilityState === "hidden" &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      new Notification("Leads atrasados", {
        body:
          overdueCount === 1
            ? "1 lead está sem contato dentro do prazo."
            : `${overdueCount} leads estão sem contato dentro do prazo.`,
        tag: "overdue-leads",
      });
    }
  }, [leads, settings?.notify_overdue_leads]);
}
