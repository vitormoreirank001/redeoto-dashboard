-- Automation messages (VMP) — thread estruturada do WhatsApp, ligada via n8n.
--
-- Contexto: automation_foundation (20260721000000) já preparou phone_e164 e
-- deixou explícito nos comentários que a idempotência "uma mensagem por lead
-- por janela" mora aqui. Esta migration cria essa tabela.
--
-- whatsapp_events (edge function whatsapp-webhook) continua existindo como
-- log bruto de payload não-parseado. automation_messages é o dado ESTRUTURADO
-- que o n8n grava depois de parsear o payload da Uazapi e resolver o lead via
-- phone_e164 — é o que a UI (chat.tsx) lê e renderiza.

CREATE TABLE IF NOT EXISTS public.automation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'audio', 'video', 'image', 'document', 'location', 'other')),

  body text,
  -- Caminho do objeto no bucket MinIO "whatsapp-media" (ex: "leads/<id>/<uuid>.ogg").
  -- NULL para mensagens de texto puro. O bucket expira mídia em 7 dias — o texto
  -- (coluna body) fica pra sempre, é o histórico de CRM. Ver [[VPS-Hostinger]].
  media_bucket_key text,
  media_mime_type text,
  media_duration_seconds integer,

  -- ID da mensagem no WhatsApp/Uazapi. Uazapi pode reentregar o mesmo evento de
  -- webhook mais de uma vez (retry) — sem isso, uma reentrega duplicaria a
  -- mensagem no chat. UNIQUE parcial (não bloqueia quando NULL, ex: notas
  -- internas antigas migradas sem esse id).
  wa_message_id text,

  sender_name text,
  is_from_bot boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'read', 'failed')),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_messages_wa_message_id
  ON public.automation_messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_messages_lead_created
  ON public.automation_messages (lead_id, created_at);

COMMENT ON TABLE public.automation_messages IS
  'Thread estruturada de mensagens WhatsApp por lead, escrita pelo n8n (a partir do webhook da Uazapi) e pela UI (chat.tsx). Mídia expira em 7 dias no MinIO; esta tabela não.';

-- ============================================================
-- Toca last_inbound_at do lead a cada mensagem recebida DELE.
--
-- Mesma lógica que a automation_foundation já documentou: "se o paciente
-- acabou de escrever, o robô não cobra ele". Antes dependia de algo externo
-- atualizar leads.last_inbound_at; com automation_messages existindo, o
-- trigger mais confiável é aqui, na origem do dado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_lead_last_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE public.leads
    SET last_inbound_at = NEW.created_at
    WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_touch_lead ON public.automation_messages;

CREATE TRIGGER trg_messages_touch_lead
  AFTER INSERT ON public.automation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_lead_last_inbound();

-- ============================================================
-- RLS — mesmo padrão de leads (20260719000000_security_hardening):
-- equipe autenticada lê/cria/atualiza (ex: marcar como lida), só admin apaga
-- (dado de paciente). O n8n usa a service role key, que ignora RLS.
-- ============================================================
ALTER TABLE public.automation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_messages_select_auth" ON public.automation_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "automation_messages_insert_auth" ON public.automation_messages
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "automation_messages_update_auth" ON public.automation_messages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "automation_messages_delete_admin" ON public.automation_messages
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
