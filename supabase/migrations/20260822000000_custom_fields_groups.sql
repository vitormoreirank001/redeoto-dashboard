-- Organiza campos personalizados em grupos (v4.1.1 §1).
--
-- Hoje todo campo personalizado cai numa única grade sem categoria no fim do
-- formulário do lead — fica confuso quando existem vários campos de assuntos
-- diferentes (ex: um campo de "Convênio" e outro de "Alergias" no mesmo bloco
-- sem distinção). Referência: Kommo agrupa campos personalizados em "grupos"
-- (endpoint /custom_fields/groups), que a UI deles renderiza como abas
-- (Principal/Marketing/Veículos/...). Aqui usamos um texto livre em vez de
-- uma tabela de grupos à parte — não há necessidade de CRUD de grupos
-- separado nesse estágio, só de agrupar visualmente.
ALTER TABLE public.custom_fields
  ADD COLUMN group_name TEXT NOT NULL DEFAULT 'Outros';

COMMENT ON COLUMN public.custom_fields.group_name IS
  'Nome do grupo/seção onde o campo aparece no formulário do lead e no chat (ex: "Convênio", "Histórico médico"). Texto livre digitado pelo admin ao criar o campo — sem tabela de grupos separada de propósito.';
