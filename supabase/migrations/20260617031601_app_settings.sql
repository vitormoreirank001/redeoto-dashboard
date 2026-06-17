-- Singleton settings row (logo, integrations)
CREATE TABLE public.app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  logo_url TEXT,
  whatsapp_webhook_token UUID NOT NULL DEFAULT gen_random_uuid(),
  whatsapp_connected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings_all_auth" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.app_settings (id) VALUES (true);

CREATE TRIGGER app_settings_touch BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Raw inbound WhatsApp events (until the agency's JSON shape is known)
CREATE TABLE public.whatsapp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_events TO authenticated;
GRANT ALL ON public.whatsapp_events TO service_role;
ALTER TABLE public.whatsapp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_events_select_auth" ON public.whatsapp_events FOR SELECT TO authenticated USING (true);

-- Public bucket for branding assets (logo)
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "branding_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');
CREATE POLICY "branding_auth_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding');
CREATE POLICY "branding_auth_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding');
