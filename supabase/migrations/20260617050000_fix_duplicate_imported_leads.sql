-- Remove duplicate rows created by a double-paste of the patient import
-- (matched on name + phone + notes, which uniquely identify each imported row).
DELETE FROM public.leads a
USING public.leads b
WHERE a.notes LIKE '%Importado do Painel de Vendas em 17/06/2026%'
  AND b.notes LIKE '%Importado do Painel de Vendas em 17/06/2026%'
  AND a.name = b.name
  AND a.phone = b.phone
  AND a.notes = b.notes
  AND a.id > b.id;
