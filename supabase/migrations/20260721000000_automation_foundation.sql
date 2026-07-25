-- Fundação da automação (VMP) — Fase 0 de 9.
--
-- Esta migration NÃO liga nenhuma automação e NÃO muda nenhum comportamento do app.
-- Ela só prepara o terreno para o motor de follow-up/lembrete que roda no n8n:
--
--   1. normalize_phone_br()  -> forma canônica de telefone, base do dedupe
--   2. leads.phone_e164      -> derivada, é por onde o inbound do WhatsApp acha o lead
--   3. leads.stage_changed_at-> base temporal CORRETA do SLA (ver bug abaixo)
--   4. leads.last_inbound_at -> "o paciente acabou de escrever, não cobra ele"
--
-- Compatível com o SQL Editor do Supabase (sem o operador jsonb `?`, que o editor
-- interpreta como placeholder de parâmetro — mesma pegadinha documentada em
-- 20260720000000_lead_closed_at.sql).

-- ============================================================
-- 1. normalize_phone_br: forma canônica +55DD9XXXXXXXX
--
-- O problema do 9º dígito: o JID que o WhatsApp entrega para celular de MG/DDD 31
-- frequentemente vem SEM o 9 (5531988887777), enquanto a colaboradora digita COM
-- o 9 no cadastro. São a mesma pessoa e hoje seriam dois leads diferentes.
-- Canonizamos SEMPRE COM o 9 para celular — assim os dois lados colidem na mesma
-- string e o dedupe funciona nos dois sentidos.
--
-- Retorna NULL — "não sei deduplicar isto com segurança" — em vez de chutar quando
-- falta DDD, quando é internacional, ou quando sobrou lixo. NULL é intencional e é
-- a decisão mais importante da função: deduplicar errado significa mandar mensagem
-- sobre o tratamento do paciente A para o telefone do paciente B. Preferimos criar
-- um lead duplicado (a equipe resolve em 10 segundos) a vazar dado de saúde.
-- ============================================================
CREATE OR REPLACE FUNCTION public.normalize_phone_br(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  d text;
  ddd text;
  rest text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  d := regexp_replace(raw, '\D', '', 'g');   -- só dígitos: tira (), -, espaço, +
  d := regexp_replace(d, '^0+', '');         -- "031" / "0031" -> "31"

  IF d = '' THEN
    RETURN NULL;
  END IF;

  -- Código do país: aceita 55 na frente (12 ou 13 dígitos no total).
  IF length(d) IN (12, 13) AND left(d, 2) = '55' THEN
    d := substr(d, 3);
  ELSIF length(d) > 13 THEN
    RETURN NULL;                             -- internacional: não adivinha
  END IF;

  -- Sem DDD não dá para montar chave confiável (8/9 dígitos soltos são ambíguos).
  IF length(d) NOT IN (10, 11) THEN
    RETURN NULL;
  END IF;

  ddd  := left(d, 2);
  rest := substr(d, 3);

  IF ddd::int < 11 THEN
    RETURN NULL;                             -- DDD inexistente
  END IF;

  -- 9º dígito: celular antigo (8 dígitos começando em 6-9) ganha o 9 na frente.
  -- Fixo (8 dígitos começando em 2-5) fica como está — não existe 9 em fixo.
  IF length(rest) = 8 AND left(rest, 1) IN ('6', '7', '8', '9') THEN
    rest := '9' || rest;
  END IF;

  RETURN '+55' || ddd || rest;
END;
$$;

COMMENT ON FUNCTION public.normalize_phone_br(text) IS
  'Forma canônica de telefone BR (+55DD9XXXXXXXX), ou NULL quando não é seguro deduplicar. '
  'Assume origem brasileira: use para o que a EQUIPE digita. Para JID do WhatsApp use '
  'normalize_phone_jid(), que exige o código do país.';

-- ------------------------------------------------------------
-- normalize_phone_jid: variante ESTRITA para o inbound do WhatsApp.
--
-- Por que existe: normalize_phone_br() assume que o número é brasileiro, e para o
-- que a equipe digita isso está certo. Mas ela não tem como distinguir "11 dígitos
-- BR sem código de país" de "11 dígitos internacional COM código de país" — testado:
-- o americano +1 415 555 2671 vira "+5514155552671", um celular de Bauru/SP
-- perfeitamente plausível. Se um número estrangeiro escrever para a clínica, o
-- inbound criaria/casaria um lead no telefone de um desconhecido — exatamente o
-- vazamento que o retorno NULL existe para evitar.
--
-- O JID do WhatsApp SEMPRE carrega o código do país, então aqui dá para exigir o 55
-- e recusar o resto. Uma regra só: valida o país e delega o resto.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_phone_jid(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  d text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  -- Aceita "5531998887777@s.whatsapp.net", "+55 31 99888-7777", etc.
  d := regexp_replace(split_part(raw, '@', 1), '\D', '', 'g');

  IF length(d) NOT IN (12, 13) OR left(d, 2) <> '55' THEN
    RETURN NULL;   -- sem código do país BR: não é nosso, não adivinha
  END IF;

  RETURN public.normalize_phone_br(d);
END;
$$;

COMMENT ON FUNCTION public.normalize_phone_jid(text) IS
  'Normaliza JID/telefone vindo do WhatsApp EXIGINDO o código do país 55. Retorna NULL para '
  'número estrangeiro (que normalize_phone_br interpretaria como BR e casaria com o lead errado). '
  'É esta que o WF2/n8n deve chamar via POST /rest/v1/rpc/normalize_phone_jid.';

-- ============================================================
-- 2. leads.phone_e164 — ponto de dedupe do inbound
--
-- Coluna comum + trigger, e NÃO uma coluna GENERATED. Coluna gerada exigiria que a
-- função fosse IMMUTABLE para sempre e o Postgres passa a travar a evolução dela.
-- A regra do 9º dígito é justamente o tipo de coisa que a gente ajusta depois de ver
-- telefone real da base. Com trigger, corrigir é CREATE OR REPLACE FUNCTION + um
-- UPDATE leads SET phone = phone.
-- ============================================================
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_e164 text;

COMMENT ON COLUMN public.leads.phone_e164 IS
  'Derivada de phone pelo trigger trg_leads_phone_e164. NUNCA editar direto — o trigger sobrescreve.';

CREATE OR REPLACE FUNCTION public.sync_lead_phone_e164()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.phone_e164 := public.normalize_phone_br(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_phone_e164 ON public.leads;

-- Sem "OF phone" de propósito: qualquer UPDATE re-deriva a coluna. O volume da
-- clínica é baixo e isso impede que alguém grave phone_e164 à mão e crie divergência
-- silenciosa entre phone e phone_e164.
CREATE TRIGGER trg_leads_phone_e164
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_phone_e164();

UPDATE public.leads SET phone_e164 = public.normalize_phone_br(phone);

CREATE INDEX IF NOT EXISTS idx_leads_phone_e164
  ON public.leads (phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- Índice ÚNICO aqui seria um erro: paciente que fechou implante em 2025 e volta em
-- 2027 por aparelho é legitimamente um lead NOVO — unicidade quebraria o funil,
-- o entry_date e a taxa de conversão. A idempotência que interessa não é "um lead
-- por telefone", é "uma mensagem por lead por janela", e mora em automation_messages.

-- ============================================================
-- 3. leads.stage_changed_at — base temporal CORRETA do SLA
--
-- Corrige dois bugs de src/lib/lead-sla.ts que eram cosméticos enquanto o SLA era só
-- um badge vermelho no Kanban, mas viram mensagem errada no WhatsApp do paciente
-- assim que o robô entra em cena:
--
--   a) overdueFollowupStep() mede os passos contra entry_date. Um lead que entrou há
--      30 dias e é movido para "Follow-up" HOJE aparece vencido em 24h, 3d, 7d E 14d
--      ao mesmo tempo — o robô dispararia as quatro mensagens no mesmo minuto,
--      incluindo o "última mensagem para não incomodar".
--   b) isOverdue() mede o SLA contra updated_at. Corrigir um typo no nome do lead
--      zera o relógio do SLA.
--
-- O que a régua de relacionamento realmente significa é "há quanto tempo este lead
-- está NESTA etapa" — que é exatamente stage_changed_at.
-- ============================================================
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_inbound_at  timestamptz;

COMMENT ON COLUMN public.leads.stage_changed_at IS
  'Quando o lead entrou na etapa atual. Base do SLA e dos follow-ups (NÃO usar entry_date/updated_at).';

COMMENT ON COLUMN public.leads.last_inbound_at IS
  'Última mensagem recebida DO lead. Se ele acabou de escrever, o robô não manda cobrança automática.';

-- Backfill: aproximação, porque não existe histórico de mudança de etapa.
--
-- ATENÇÃO: é justamente por esse backfill ser aproximado que automation_rules.starts_at
-- existe. Sem aquela trava, ligar uma regra faria o robô considerar toda a base antiga
-- de uma vez e disparar um mutirão de mensagens em cima de paciente frio. Nenhuma regra
-- pode olhar para nada anterior ao instante em que foi ligada.
UPDATE public.leads
SET stage_changed_at = COALESCE(updated_at, entry_date, created_at)
WHERE stage_changed_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_lead_stage_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_changed_at := COALESCE(NEW.stage_changed_at, now());
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_stage_changed_at ON public.leads;

CREATE TRIGGER trg_leads_stage_changed_at
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_stage_changed_at();

-- ============================================================
-- 4. Índices — o n8n vai varrer estas colunas a cada 15 minutos
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leads_stage_changed_at
  ON public.leads (stage, stage_changed_at);

CREATE INDEX IF NOT EXISTS idx_leads_appointment_date
  ON public.leads (appointment_date)
  WHERE appointment_date IS NOT NULL;
