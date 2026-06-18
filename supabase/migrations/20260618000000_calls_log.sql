-- Replace the calls_made/calls_answered counters with a per-call log:
-- each entry records whether the call was answered and exactly when it happened.
ALTER TABLE public.leads
  ADD COLUMN calls JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.leads
  DROP COLUMN calls_made,
  DROP COLUMN calls_answered;
