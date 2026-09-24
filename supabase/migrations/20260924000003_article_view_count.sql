-- ============================================================================
-- Contagem de visualizações por artigo. Incrementada pelo próprio site
-- público (sem sessão — chave `anon`), por isso não pode ser um UPDATE direto
-- de content_items (isso obrigaria a abrir uma policy de UPDATE a `anon`, que
-- podia tocar em qualquer coluna). Em vez disso, uma função `security definer`
-- que só sabe fazer uma coisa: incrementar view_count de um artigo já publicado.
-- ============================================================================

alter table public.content_items
  add column if not exists view_count int not null default 0;

create or replace function public.increment_article_view(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.content_items
  set view_count = view_count + 1
  where id = p_id and status = 'published';
$$;

grant execute on function public.increment_article_view(uuid) to anon, authenticated;

create or replace view public.published_articles as
select
  c.id,
  c.title,
  c.body,
  c.media_url,
  c.author ->> 'byline'                              as author,
  c.author ->> 'editor'                               as editor,
  c.author ->> 'desk'                                 as desk,
  coalesce((c.author ->> 'ai_assisted')::boolean, true) as ai_assisted,
  c.published_at,
  c.published_url,
  coalesce(c.metadata ->> 'slug', c.id::text)         as slug,
  c.metadata ->> 'seo_description'                     as seo_description,
  c.metadata ->> 'dek'                                 as dek,
  coalesce(c.metadata -> 'tags', '[]'::jsonb)           as tags,
  c.metadata ->> 'source_name'                          as source_name,
  c.metadata ->> 'source_url'                           as source_url,
  t.category,
  c.view_count
from public.content_items c
join public.topics t on t.id = c.topic_id
where c.status = 'published';

grant select on public.published_articles to anon, authenticated;
