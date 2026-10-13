-- Bucket privado para mídia do WhatsApp (áudio/foto/vídeo/documento).
-- Upload feito pelo n8n com service_role; leitura via URL assinada pelo app.
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-media', 'whatsapp-media', false, 52428800)
on conflict (id) do nothing;

create policy whatsapp_media_select_auth on storage.objects
  for select to authenticated
  using (bucket_id = 'whatsapp-media');
