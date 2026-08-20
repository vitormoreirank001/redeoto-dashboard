-- Liga/desliga global da notificação de leads atrasados (toast + push do navegador)
ALTER TABLE public.app_settings
  ADD COLUMN notify_overdue_leads BOOLEAN NOT NULL DEFAULT true;
