-- Security hardening (VMP / revisao-sistema-seguro).
-- Contexto: cadastro público foi fechado (signup off + login-only), então
-- "authenticated" = equipe de confiança da clínica. Ainda assim, aplicamos
-- menor privilégio: ações destrutivas e de configuração ficam restritas a admin.
--
-- Policies são PERMISSIVAS (avaliadas em OR): manter uma policy de SELECT aberta
-- à equipe + uma de escrita restrita a admin => leitura liberada, escrita só admin.

-- ============================================================
-- LEADS: equipe lê/cria/edita; só ADMIN deleta (dado de paciente / LGPD).
-- (Idealmente migrar para soft-delete com deleted_at — próximo passo.)
-- ============================================================
DROP POLICY IF EXISTS "leads_all_auth" ON public.leads;

CREATE POLICY "leads_select_auth" ON public.leads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "leads_insert_auth" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "leads_update_auth" ON public.leads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "leads_delete_admin" ON public.leads
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- MONTHLY_GOALS: metas de faturamento = dado de gestão. Equipe lê, admin escreve.
-- ============================================================
DROP POLICY IF EXISTS "monthly_goals_all_auth" ON public.monthly_goals;

CREATE POLICY "monthly_goals_select_auth" ON public.monthly_goals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "monthly_goals_write_admin" ON public.monthly_goals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- SERVICES: catálogo/preços de referência. Equipe lê, admin escreve.
-- ============================================================
DROP POLICY IF EXISTS "services_all_auth" ON public.services;

CREATE POLICY "services_select_auth" ON public.services
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "services_write_admin" ON public.services
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- APP_SETTINGS: guarda logo + whatsapp_webhook_token (segredo) + horários de agenda.
-- Equipe LÊ (precisa do logo e dos horários). Só ADMIN escreve (trocar branding /
-- rotacionar token / mudar horários). Antes qualquer logado podia alterar tudo.
-- Obs.: o ideal a seguir é mover o token para um secret (fora de tabela lida no
-- client) e expor a URL do webhook via Edge Function admin-only. Registrado como
-- próximo passo em [[revisao-sistema-seguro]].
-- ============================================================
DROP POLICY IF EXISTS "app_settings_all_auth" ON public.app_settings;

CREATE POLICY "app_settings_select_auth" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_settings_write_admin" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- DAILY_CALLS: log operacional da equipe comercial — mantém leitura/escrita
-- para authenticated (a colaboradora registra as ligações). Sem mudança de escopo,
-- apenas deixamos explícito.
-- ============================================================
-- (Policy "daily_calls_all_auth" permanece como está.)
