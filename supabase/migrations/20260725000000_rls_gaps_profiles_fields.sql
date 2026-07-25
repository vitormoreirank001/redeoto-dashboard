-- Fecha o restante do USING(true) apontado na auditoria de 2026-07-20
-- (o hardening de 19/07 só cobriu leads/monthly_goals/services/app_settings).
--
-- Critério pra decidir o que mexe aqui: só restringe onde a leitura ampla vaza
-- PII real ou onde não existe hoje nenhum caminho legítimo de escrita por
-- não-admin. Não restringe operação do dia a dia da equipe.

-- ============================================================
-- PROFILES: nome + e-mail de TODOS os usuários pra qualquer autenticado.
-- Único lugar que lista todos os perfis é configuracoes.tsx, que já é
-- adminOnly na UI — mas a RLS não sabia disso e permitia ler direto via API.
-- app-shell.tsx e dashboard.tsx só consultam o próprio perfil (auth.uid()),
-- então essa troca não quebra nada existente.
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_all_auth" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- FIELD_OPTIONS / CUSTOM_FIELDS: definem os dropdowns (mídia/origem) e campos
-- customizados do CRM. Sem PII, mas hoje qualquer autenticado pode
-- inserir/apagar — na prática só configuracoes.tsx (adminOnly na UI) escreve;
-- crm.tsx e lead-modal.tsx só leem pro dropdown. Restringir escrita a admin
-- não tira nenhum fluxo real da equipe.
-- ============================================================
DROP POLICY IF EXISTS "field_options_all_auth" ON public.field_options;

CREATE POLICY "field_options_select_auth" ON public.field_options
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "field_options_write_admin" ON public.field_options
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "custom_fields_all_auth" ON public.custom_fields;

CREATE POLICY "custom_fields_select_auth" ON public.custom_fields
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "custom_fields_write_admin" ON public.custom_fields
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Deixados de fora de propósito:
--
-- INVENTORY_ITEMS: sem PII de paciente, e qualquer colaborador precisa dar
-- entrada/baixa de estoque no dia a dia (estoque.tsx não é adminOnly). Restringir
-- via RLS quebraria esse fluxo sem antes mexer na UI — fora de escopo aqui.
--
-- DAILY_CALLS: já foi revisado e mantido de propósito em
-- 20260719000000_security_hardening.sql (log operacional da equipe, sem PII
-- além do que já aparece em leads). Não reabrindo essa decisão.
-- ============================================================
