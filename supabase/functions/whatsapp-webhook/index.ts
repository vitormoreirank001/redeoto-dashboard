// Recebe eventos da integração de WhatsApp da agência e guarda o payload bruto,
// já que o formato exato do JSON ainda não foi definido. Autenticação própria via
// header "x-webhook-token" (comparado com app_settings.whatsapp_webhook_token), sem
// depender do header Authorization do Supabase — por isso a função deve ser criada com
// "Enforce JWT Verification" desligado no dashboard.
// SEGURANÇA: o segredo vai no HEADER, não na query string (URL vaza em logs de
// proxy/CDN/Supabase). O fallback ?token= existe só para migração do provedor atual;
// remover assim que a integração passar a mandar o header.
import { createClient } from "jsr:@supabase/supabase-js@2";

// Comparação em tempo constante para não vazar o segredo por timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const token =
    req.headers.get("x-webhook-token") ?? new URL(req.url).searchParams.get("token");
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

  if (!settings?.whatsapp_webhook_token || !safeEqual(settings.whatsapp_webhook_token, token)) {
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
