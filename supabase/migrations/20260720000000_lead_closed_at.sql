-- Reconhecimento de receita pela DATA DA VENDA (VMP).
--
-- Problema: financeiro/dashboard/estatísticas somavam budget_amount agrupando por
-- entry_date (data de ENTRADA do lead). Um lead que entra em junho e fecha em julho
-- tinha a receita contada em junho. Em 20/07/2026 isso jogava R$15.420 de julho para
-- junho — R$15.000 só da paciente Maria José Lima Pessoa (entrada 20/06, venda 16/07).
--
-- Solução: coluna própria closed_at, preenchida quando o lead entra em "fechado".
-- entry_date continua sendo a métrica de CAPTAÇÃO (leads por mês) — isso estava certo.

-- ============================================================
-- 1. Coluna
-- ============================================================
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS closed_at timestamptz;

COMMENT ON COLUMN public.leads.closed_at IS
  'Data em que a venda foi fechada. Base do faturamento (DRE/dashboard). NULL se o lead não está em "fechado".';

-- ============================================================
-- 2. Backfill dos fechados existentes
--
-- Fonte da verdade, em ordem:
--   a) maior "at" do array vendas (registro real da venda)
--   b) fallback entry_date — cobre os ~18 leads do import inicial da base de clientes
--      (17-20/06), que estão fechados mas sem array vendas. Sem esse fallback eles
--      sumiriam do faturamento em vez de apenas mudar de mês.
-- ============================================================
UPDATE public.leads l
SET closed_at = COALESCE(
  (
    SELECT max((v->>'at')::timestamptz)
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(to_jsonb(l.vendas)) = 'array'
        THEN to_jsonb(l.vendas)
        ELSE '[]'::jsonb
      END
    ) AS v
    -- Sem o operador jsonb `?` de propósito: o SQL Editor do Supabase trata `?`
    -- como placeholder de parâmetro e quebra o parse do statement.
    WHERE v->>'at' IS NOT NULL
  ),
  l.entry_date
)
WHERE l.stage = 'fechado'
  AND l.closed_at IS NULL;

-- ============================================================
-- 3. Trigger: manter closed_at coerente com o stage daqui pra frente
--
-- - entrou em "fechado" sem data  -> grava now()
-- - saiu de "fechado"             -> limpa (senão fica data fantasma no DRE)
-- - continua em "fechado"         -> preserva (permite correção manual da data)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_lead_closed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage = 'fechado' THEN
    IF NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
  ELSE
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_closed_at ON public.leads;

CREATE TRIGGER trg_leads_closed_at
  BEFORE INSERT OR UPDATE OF stage, closed_at ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_closed_at();

-- ============================================================
-- 4. Índice — DRE e dashboard filtram fechados por faixa de data
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leads_closed_at
  ON public.leads (closed_at)
  WHERE stage = 'fechado';
