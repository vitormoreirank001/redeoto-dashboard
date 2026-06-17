-- The previous dedup (20260617050000) matched on `notes`, but a paste into the SQL
-- editor inserted line breaks inside that text, so the LIKE filter silently matched
-- nothing and removed 0 rows. Re-do the dedup using name + phone + budget_amount +
-- stage instead, scoped to the import batch (created after 2026-06-17 14:00 UTC).
DELETE FROM public.leads a
USING public.leads b
WHERE a.created_at > '2026-06-17 14:00:00+00'
  AND b.created_at > '2026-06-17 14:00:00+00'
  AND a.name = b.name
  AND a.phone = b.phone
  AND a.budget_amount = b.budget_amount
  AND a.stage = b.stage
  AND a.id > b.id;
