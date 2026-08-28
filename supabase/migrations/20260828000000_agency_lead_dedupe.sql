-- Duplicados de captura da agência — achado numa auditoria pedida pelo Vitor
-- (2026-08-28), a partir de um print mostrando 2 cards "Danoninho" pro mesmo
-- WhatsApp no CRM.
--
-- Causa raiz encontrada via REST (dados reais, 439 leads): 7 telefones tinham
-- 2+ leads ABERTOS ao mesmo tempo (15 leads no total). Em todos os 7, o padrão
-- é o mesmo: um insert vem da automação de WhatsApp (n8n/Uazapi, media
-- "Automatico (WhatsApp)", é quem grava a conversa em automation_messages logo
-- em seguida) e outro insert INDEPENDENTE vem de uma agência de anúncios
-- (custom_data.agency_event = 'lead.captured', custom_data.agency_cliente_id
-- fixo) capturando o "lead" do clique no anúncio — o mesmo contato gera 2
-- eventos quase simultâneos em 2 sistemas diferentes, e nenhum dos dois confere
-- se já existe um lead aberto pro telefone antes de inserir.
--
-- Confirmado card a card antes de escrever esta migration: em TODOS os casos o
-- lead da agência está vazio (zero mensagem em automation_messages, sem
-- orçamento/nota/agendamento) — só carrega metadado de atribuição de
-- campanha. É seguro mesclar e apagar sem perder conversa nenhuma.
--
-- NÃO cria índice único em phone_e164 (já documentado como erro em
-- automation_foundation.sql: paciente que fecha em 2025 e volta em 2027 é
-- lead novo legítimo). A trave aqui é mais estreita: só telefone + lead
-- ABERTO (stage não fechado/perdido) + especificamente o insert do LADO DA
-- AGÊNCIA — nunca cancela um insert do lado do WhatsApp, de propósito (ver
-- função abaixo), pra nunca arriscar quebrar o passo seguinte do n8n que grava
-- a mensagem em automation_messages usando o id do lead recém-criado.

-- ============================================================
-- 1. Trigger: previne duplicata da agência daqui pra frente
-- ============================================================
CREATE OR REPLACE FUNCTION public.merge_agency_lead_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  primary_id uuid;
BEGIN
  -- Só age quando ESTE insert é especificamente uma captura da agência
  -- (custom_data.agency_event = 'lead.captured'). Insert do lado do WhatsApp
  -- (n8n) nunca é cancelado por esta trigger — se a automação criar o lead
  -- primeiro (caso observado 7/7 vezes) ou depois, o dela sempre sobrevive.
  IF NEW.phone_e164 IS NULL OR NEW.custom_data ->> 'agency_event' IS DISTINCT FROM 'lead.captured' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO primary_id
  FROM public.leads
  WHERE phone_e164 = NEW.phone_e164
    AND id <> NEW.id
    AND stage NOT IN ('fechado', 'perdido')
  ORDER BY entry_date ASC
  LIMIT 1;

  -- Sem lead aberto pra esse telefone ainda: deixa este ser o primeiro (nada
  -- pra mesclar, a automação de WhatsApp que criar depois é que vai reusar
  -- este, não o contrário).
  IF primary_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.leads
  SET
    custom_data = custom_data || jsonb_strip_nulls(jsonb_build_object('attribution', NEW.custom_data -> 'attribution')),
    history = history || jsonb_build_array(jsonb_build_object(
      'at', now(),
      'text', 'Captura duplicada da agência (mesmo telefone, lead já aberto) mesclada automaticamente — sem conversa própria.'
    ))
  WHERE id = primary_id;

  UPDATE public.automation_messages SET lead_id = primary_id WHERE lead_id = NEW.id;

  DELETE FROM public.leads WHERE id = NEW.id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_merge_agency_duplicate ON public.leads;

CREATE TRIGGER trg_leads_merge_agency_duplicate
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.merge_agency_lead_duplicate();

-- ============================================================
-- 2. Backfill: aplica a mesma regra nos 7 casos já existentes na base
-- ============================================================
DO $$
DECLARE
  dup RECORD;
  primary_id uuid;
BEGIN
  FOR dup IN
    SELECT id, phone_e164, custom_data
    FROM public.leads
    WHERE phone_e164 IS NOT NULL
      AND stage NOT IN ('fechado', 'perdido')
      AND custom_data ->> 'agency_event' = 'lead.captured'
  LOOP
    SELECT id INTO primary_id
    FROM public.leads
    WHERE phone_e164 = dup.phone_e164
      AND id <> dup.id
      AND stage NOT IN ('fechado', 'perdido')
    ORDER BY entry_date ASC
    LIMIT 1;

    IF primary_id IS NOT NULL THEN
      UPDATE public.leads
      SET
        custom_data = custom_data || jsonb_strip_nulls(jsonb_build_object('attribution', dup.custom_data -> 'attribution')),
        history = history || jsonb_build_array(jsonb_build_object(
          'at', now(),
          'text', 'Captura duplicada da agência (mesmo telefone, lead já aberto) mesclada automaticamente — sem conversa própria.'
        ))
      WHERE id = primary_id;

      UPDATE public.automation_messages SET lead_id = primary_id WHERE lead_id = dup.id;

      DELETE FROM public.leads WHERE id = dup.id;
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Caso residual, achado na mesma auditoria, NÃO coberto pela regra acima:
-- 2 leads "Milena Fonseca" (+5585981724957) criados pelo próprio lado do
-- WhatsApp com 137ms de diferença (corrida de entrega dupla do webhook da
-- automação, não duplicata da agência — por isso a trigger acima não mexe
-- aqui de propósito). Limpeza pontual, uma vez só: move a 1 mensagem do
-- duplicado pro lead que ficou com a conversa principal (11 mensagens) e
-- remove o duplicado vazio.
-- ------------------------------------------------------------
UPDATE public.automation_messages
SET lead_id = '38952982-8a10-4313-a922-ee9f8f6b5a0d'
WHERE lead_id = 'fb6a10b7-e239-44a6-af97-2c4df274ee30';

UPDATE public.leads
SET history = history || jsonb_build_array(jsonb_build_object(
  'at', now(),
  'text', 'Lead duplicado por corrida de entrega do webhook (137ms de diferença) mesclado manualmente — 1 mensagem movida pra cá.'
))
WHERE id = '38952982-8a10-4313-a922-ee9f8f6b5a0d';

DELETE FROM public.leads WHERE id = 'fb6a10b7-e239-44a6-af97-2c4df274ee30';
