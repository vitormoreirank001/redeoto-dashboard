// Recebe eventos da integração de WhatsApp da agência e guarda o payload bruto,
// já que o formato exato do JSON ainda não foi definido. Autenticação própria via
// ?token=... (comparado com app_settings.whatsapp_webhook_token), sem depender
// do header Authorization do Supabase — por isso a função deve ser criada com
// "Enforce JWT Verification" desligado no dashboard.
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return new Response(JSON.stringify({ error: "missing token" }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: settings } = await supabase
    .from("app_settings")
    .select("whatsapp_webhook_token")
    .eq("id", true)
    .maybeSingle();

  if (!settings || settings.whatsapp_webhook_token !== token) {
    return new Response(JSON.stringify({ error: "invalid token" }), { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (payload === null) {
    return new Response(JSON.stringify({ error: "invalid json body" }), { status: 400 });
  }

  await supabase.from("whatsapp_events").insert({ payload });
  await supabase
    .from("app_settings")
    .update({ whatsapp_connected_at: new Date().toISOString() })
    .eq("id", true);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
