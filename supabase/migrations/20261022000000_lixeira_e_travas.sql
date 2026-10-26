-- Lixeira + travas de integridade — 22/10/2026.
-- Adaptado do que já roda em produção na Estrela do Mar (migration
-- permissoes_equipe_e_lixeira, 15/10/2026).
--
-- 1. Lixeira: todo DELETE em leads, automation_messages, services e expenses
--    guarda a linha inteira em public.lixeira, com quem apagou. O admin vê e
--    restaura pela tela de Configurações. Restaurar um lead traz de volta as
--    mensagens do chat que foram apagadas junto (ON DELETE CASCADE).
-- 2. (trava de etapas: ver 20261026000000_funil_ia_e_cadencia.sql)
-- 3. automation_messages: UPDATE deixa de ser aberto a qualquer usuário
--    logado. O front não edita mensagem; quem atualiza status/mídia é o n8n,
--    com a service role (que ignora RLS).
--
-- Pode rodar mais de uma vez (IF NOT EXISTS / DROP IF EXISTS).
-- ORDEM: aplicar ANTES de publicar o front desta versão. Se o front for antes,
-- a seção Lixeira de Configurações só fica escondida (não quebra nada).

-- ---------------------------------------------------------------------------
-- 1. Lixeira
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lixeira (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL,
  registro_id uuid NOT NULL,
  dados jsonb NOT NULL,
  apagado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  apagado_em timestamptz NOT NULL DEFAULT now(),
  restaurado_em timestamptz
);
CREATE INDEX IF NOT EXISTS idx_lixeira_apagado_em ON public.lixeira (apagado_em DESC);
CREATE INDEX IF NOT EXISTS idx_lixeira_lead_msgs
  ON public.lixeira ((dados->>'lead_id'))
  WHERE tabela = 'automation_messages';

REVOKE ALL ON public.lixeira FROM anon;
GRANT SELECT ON public.lixeira TO authenticated;
GRANT ALL ON public.lixeira TO service_role;
ALTER TABLE public.lixeira ENABLE ROW LEVEL SECURITY;

-- Só leitura, só admin. Escrita apenas pelo trigger e pela RPC abaixo.
DROP POLICY IF EXISTS "lixeira_select_admin" ON public.lixeira;
CREATE POLICY "lixeira_select_admin" ON public.lixeira
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.lixeira IS
  'Cópia de toda linha apagada de leads/automation_messages/services/expenses. Escrita só por trigger SECURITY DEFINER.';

CREATE OR REPLACE FUNCTION public.guardar_na_lixeira()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.lixeira (tabela, registro_id, dados, apagado_por)
  VALUES (TG_TABLE_NAME, OLD.id, to_jsonb(OLD), auth.uid());
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS lixeira_leads ON public.leads;
CREATE TRIGGER lixeira_leads AFTER DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.guardar_na_lixeira();
DROP TRIGGER IF EXISTS lixeira_automation_messages ON public.automation_messages;
CREATE TRIGGER lixeira_automation_messages AFTER DELETE ON public.automation_messages
  FOR EACH ROW EXECUTE FUNCTION public.guardar_na_lixeira();
DROP TRIGGER IF EXISTS lixeira_services ON public.services;
CREATE TRIGGER lixeira_services AFTER DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.guardar_na_lixeira();
DROP TRIGGER IF EXISTS lixeira_expenses ON public.expenses;
CREATE TRIGGER lixeira_expenses AFTER DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guardar_na_lixeira();

-- Restaura um lead (com as mensagens apagadas junto), serviço ou custo.
-- Os triggers de INSERT de leads preservam closed_at/stage_changed_at que
-- vierem preenchidos, então a venda volta para o mês original, não para hoje.
CREATE OR REPLACE FUNCTION public.restaurar_da_lixeira(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v public.lixeira%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas o administrador pode restaurar.';
  END IF;

  SELECT * INTO v FROM public.lixeira WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado na lixeira.';
  END IF;
  IF v.restaurado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este item já foi restaurado.';
  END IF;

  CASE v.tabela
    WHEN 'leads' THEN
      INSERT INTO public.leads
        SELECT * FROM jsonb_populate_record(NULL::public.leads, v.dados);
      -- Mensagens que o CASCADE apagou junto com este lead.
      INSERT INTO public.automation_messages
        SELECT (jsonb_populate_record(NULL::public.automation_messages, l.dados)).*
        FROM public.lixeira l
        WHERE l.tabela = 'automation_messages'
          AND l.dados->>'lead_id' = v.registro_id::text
          AND l.restaurado_em IS NULL
        ORDER BY l.dados->>'created_at'
        ON CONFLICT DO NOTHING;
      UPDATE public.lixeira SET restaurado_em = now()
        WHERE tabela = 'automation_messages'
          AND dados->>'lead_id' = v.registro_id::text
          AND restaurado_em IS NULL;
      -- trg_messages_touch_lead mexe em last_inbound_at a cada mensagem
      -- reinserida; volta o valor que o lead tinha quando foi apagado.
      UPDATE public.leads
        SET last_inbound_at = (v.dados->>'last_inbound_at')::timestamptz
        WHERE id = v.registro_id;
    WHEN 'automation_messages' THEN
      INSERT INTO public.automation_messages
        SELECT * FROM jsonb_populate_record(NULL::public.automation_messages, v.dados);
    WHEN 'services' THEN
      INSERT INTO public.services
        SELECT * FROM jsonb_populate_record(NULL::public.services, v.dados);
    WHEN 'expenses' THEN
      INSERT INTO public.expenses
        SELECT * FROM jsonb_populate_record(NULL::public.expenses, v.dados);
    ELSE
      RAISE EXCEPTION 'Restaurar % não é suportado.', v.tabela;
  END CASE;

  UPDATE public.lixeira SET restaurado_em = now() WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurar_da_lixeira(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurar_da_lixeira(uuid) TO authenticated;
-- Função de trigger: ninguém chama direto (REVOKE FROM PUBLIC, não só anon —
-- função nova nasce com EXECUTE para PUBLIC).
REVOKE ALL ON FUNCTION public.guardar_na_lixeira() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Etapas válidas do lead: movido para 20261026000000_funil_ia_e_cadencia.sql
--    (as etapas mudaram antes desta migration ir para produção).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. automation_messages: UPDATE só admin (n8n usa service role)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "automation_messages_update_auth" ON public.automation_messages;
DROP POLICY IF EXISTS "automation_messages_update_admin" ON public.automation_messages;
CREATE POLICY "automation_messages_update_admin" ON public.automation_messages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
