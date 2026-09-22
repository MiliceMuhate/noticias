-- ============================================================================
-- Storage: bucket `media` (público — imagens/thumbnails) e `video` (privado —
-- Shorts renderizados, servidos por URL assinado). Ver docs/DATA_MODEL.md §Storage.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('media', 'media', true),
  ('video', 'video', false)
on conflict (id) do nothing;

-- Escrita nos buckets: só o sistema (service_role, que bypassa RLS).
-- Leitura de `media`: pública (bucket public). Leitura de `video`: operadores
-- autenticados (além de URLs assinados gerados pelo worker).

create policy "video: operator read"
  on storage.objects for select to authenticated
  using (bucket_id = 'video' and public.is_operator());
