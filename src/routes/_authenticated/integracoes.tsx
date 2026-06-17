import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/integracoes")({
  component: IntegracoesPage,
});

function IntegracoesPage() {
  const { data } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("whatsapp_webhook_token,whatsapp_connected_at")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
  });

  const webhookUrl = data
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bright-action?token=${data.whatsapp_webhook_token}`
    : "";

  function copyUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada");
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Conexões externas que alimentam o sistema
        </p>
      </header>

      <section className="bg-card border border-border rounded-2xl shadow-sm p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-success/15 text-success flex items-center justify-center shrink-0">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold">WhatsApp — Redeoto</h2>
              <span
                className={
                  data?.whatsapp_connected_at
                    ? "text-xs px-2 py-0.5 rounded-full bg-success/15 text-success font-medium"
                    : "text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium"
                }
              >
                {data?.whatsapp_connected_at ? "Conectado" : "Aguardando primeira mensagem"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Envie essa URL para a agência configurar o webhook da integração de WhatsApp.
              Cada evento recebido é registrado e usado para alimentar leads e ligações no
              Dashboard.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-2 truncate">
                {webhookUrl || "Gerando..."}
              </code>
              <Button size="sm" variant="outline" onClick={copyUrl} disabled={!webhookUrl}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>

            {data?.whatsapp_connected_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Último evento recebido:{" "}
                {new Date(data.whatsapp_connected_at).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
