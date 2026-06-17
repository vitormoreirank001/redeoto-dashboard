-- Leads: entry_date now carries time, origin becomes "Origem" (lista configurável),
-- adds "Mídia" (lista configurável), per-lead call counters, and a generic custom_data bag.
ALTER TABLE public.leads
  ALTER COLUMN entry_date TYPE TIMESTAMPTZ USING entry_date::timestamptz,
  ALTER COLUMN entry_date SET DEFAULT now();

ALTER TABLE public.leads
  ADD COLUMN media TEXT NOT NULL DEFAULT '',
  ADD COLUMN calls_made INT NOT NULL DEFAULT 0,
  ADD COLUMN calls_answered INT NOT NULL DEFAULT 0,
  ADD COLUMN custom_data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Configurable option lists (Mídia, Origem, ...) managed from Configurações
CREATE TABLE public.field_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (field_key, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_options TO authenticated;
GRANT ALL ON public.field_options TO service_role;
ALTER TABLE public.field_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "field_options_all_auth" ON public.field_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.field_options (field_key, value, sort_order) VALUES
  ('midia', 'Instagram', 0),
  ('midia', 'Facebook', 1),
  ('midia', 'Base de Cliente', 2),
  ('midia', 'Parceiros', 3),
  ('midia', 'Anúncios de Tráfego', 4),
  ('midia', 'Indicação', 5),
  ('origem', 'Fluxo de Loja', 0),
  ('origem', 'WhatsApp', 1),
  ('origem', 'Formulário', 2),
  ('origem', 'Eventos', 3);

-- Generic custom fields, defined by admins in Configurações, rendered on the lead card
CREATE TABLE public.custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'boolean', 'select')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_fields TO authenticated;
GRANT ALL ON public.custom_fields TO service_role;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_fields_all_auth" ON public.custom_fields FOR ALL TO authenticated USING (true) WITH CHECK (true);
