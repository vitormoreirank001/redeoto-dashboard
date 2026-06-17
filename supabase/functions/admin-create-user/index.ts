// Cria um novo usuário (auth + profile + role) a partir de Configurações.
// Só pode ser chamada por um usuário autenticado com role "admin" — por isso usa
// a service role apenas depois de validar o chamador, nunca expondo essa chave ao cliente.
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "missing authorization" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: caller, error: callerErr } = await anonClient.auth.getUser(jwt);
  if (callerErr || !caller.user) {
    return new Response(JSON.stringify({ error: "invalid session" }), { status: 401 });
  }

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: caller.user.id,
    _role: "admin",
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const email = body?.email?.trim();
  const password = body?.password;
  const fullName = body?.full_name?.trim() || "";
  const role = body?.role === "admin" ? "admin" : "comercial";

  if (!email || !password || password.length < 6) {
    return new Response(JSON.stringify({ error: "dados inválidos" }), { status: 400 });
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (createErr) {
    return new Response(JSON.stringify({ error: createErr.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true, id: created.user?.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
