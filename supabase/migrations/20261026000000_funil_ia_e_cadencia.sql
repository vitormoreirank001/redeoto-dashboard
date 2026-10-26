-- Funil de vendas reorganizado + funil da IA de pré-atendimento — 26/10/2026.
-- Pedido do Vitor:
--   * entram as etapas "1ª Cadência" (cadencia_1) e "Despedida" (despedida);
--   * sai "Follow-up Ativo" (followup) — quem estava lá vai para 1ª Cadência;
--   * novo funil "IA - pré-atendimento", no molde do funil de mesmo nome do
--     Kommo da Auto Veículos (Entrada → Aceito automaticamente → 1ª a 4ª
--     Tentativa → Encaminhado ao comercial / Insucesso).
--
-- Rodar DEPOIS de 20261022000000_lixeira_e_travas.sql (a trava de etapas
-- saiu de lá e ficou aqui). Pode rodar mais de uma vez.
-- Mesma lista de etapas de COLUMNS/IA_COLUMNS em src/routes/_authenticated/crm.tsx.

-- ---------------------------------------------------------------------------
-- 1. Coluna funil
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS funil text NOT NULL DEFAULT 'vendas';

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_funil_valido;
ALTER TABLE public.leads ADD CONSTRAINT leads_funil_valido CHECK (funil IN ('vendas', 'ia'));

CREATE INDEX IF NOT EXISTS idx_leads_funil_stage ON public.leads (funil, stage);

-- ---------------------------------------------------------------------------
-- 2. Follow-up Ativo → 1ª Cadência (antes da trava, que não aceita mais followup)
-- ---------------------------------------------------------------------------
UPDATE public.leads
SET stage = 'cadencia_1',
    history = history || jsonb_build_array(jsonb_build_object(
      'at', now(),
      'text', 'Etapa "Follow-up Ativo" removida do funil — lead movido para 1ª Cadência.'
    ))
WHERE stage = 'followup';

-- ---------------------------------------------------------------------------
-- 3. Funil sempre derivado da etapa + encaminhamento da IA para o comercial
-- ---------------------------------------------------------------------------
-- Quem grava (front, n8n, IA) só precisa mandar a etapa. "Encaminhado ao
-- comercial" não fica parado no funil da IA: vira Novo Lead do funil de
-- vendas na mesma escrita, com registro no histórico.
-- Nome trg_leads_funil roda antes de trg_leads_stage_changed_at (ordem
-- alfabética), então o relógio da etapa já vê a etapa final.
CREATE OR REPLACE FUNCTION public.sync_lead_funil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage = 'ia_encaminhado' THEN
    NEW.stage := 'novo';
    NEW.history := COALESCE(NEW.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at', now(),
      'text', 'IA de pré-atendimento encaminhou para o comercial (Funil de vendas → Novo Lead).'
    ));
  END IF;
  NEW.funil := CASE WHEN left(NEW.stage, 3) = 'ia_' THEN 'ia' ELSE 'vendas' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_funil ON public.leads;
CREATE TRIGGER trg_leads_funil
  BEFORE INSERT OR UPDATE OF stage, funil ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_funil();

-- ---------------------------------------------------------------------------
-- 4. Etapas válidas por funil (antes era TEXT livre: um typo gravava uma etapa
--    que nenhuma coluna mostra e o lead "sumia")
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_stage_valido;
ALTER TABLE public.leads ADD CONSTRAINT leads_stage_valido CHECK (
  (funil = 'vendas' AND stage IN (
    'novo', 'contato', 'cadencia_1', 'agendado', 'nao_compareceu', 'orcamento',
    'despedida', 'fechado', 'perdido'
  ))
  OR
  (funil = 'ia' AND stage IN (
    'ia_entrada', 'ia_aceito', 'ia_tentativa_1', 'ia_tentativa_2', 'ia_tentativa_3',
    'ia_tentativa_4', 'ia_insucesso'
  ))
);
