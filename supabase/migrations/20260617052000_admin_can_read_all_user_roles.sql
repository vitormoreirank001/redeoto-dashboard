-- Admins need to see every user's role on the Usuários screen in Configurações,
-- not just their own (the original policy only allowed auth.uid() = user_id).
CREATE POLICY "user_roles_select_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
