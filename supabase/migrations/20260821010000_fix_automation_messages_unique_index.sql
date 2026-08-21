-- Corrige o índice único de automation_messages.wa_message_id.
--
-- O índice original (20260821000000_automation_messages.sql) era parcial
-- (WHERE wa_message_id IS NOT NULL) para deixar claro que múltiplas notas
-- sem id do WhatsApp são permitidas. Só que PostgREST usa esse índice como
-- alvo do "ON CONFLICT" no upsert (?on_conflict=wa_message_id, usado pelo
-- workflow n8n para não duplicar mensagem em reentrega de webhook), e
-- Postgres não aceita índice PARCIAL como alvo de ON CONFLICT — dava
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" (erro 400).
--
-- Um índice único SEM predicado resolve os dois problemas: PostgREST
-- consegue usar como alvo do upsert, e UNIQUE em Postgres já trata NULL
-- como "não igual a nada" por padrão — múltiplas linhas com
-- wa_message_id NULL continuam permitidas normalmente, sem precisar do
-- WHERE.
DROP INDEX IF EXISTS public.idx_automation_messages_wa_message_id;

CREATE UNIQUE INDEX idx_automation_messages_wa_message_id
  ON public.automation_messages (wa_message_id);
