-- Expõe a categoria real do artigo (topics.category, definida na config da
-- fonte RSS, nunca inventada) na view pública, para servir de kicker no ecrã
-- de notícias (ver .claude/design/design.md).
create or replace view public.published_articles as
select
  c.id,
  c.title,
  c.body,
  c.media_url,
  c.author,
  c.published_at,
  c.published_url,
  coalesce(c.metadata ->> 'slug', c.id::text)      as slug,
  c.metadata ->> 'seo_description'                  as seo_description,
  coalesce(c.metadata -> 'tags', '[]'::jsonb)        as tags,
  c.metadata ->> 'source_name'                       as source_name,
  c.metadata ->> 'source_url'                        as source_url,
  t.category
from public.content_items c
join public.topics t on t.id = c.topic_id
where c.status = 'published';

grant select on public.published_articles to anon, authenticated;
