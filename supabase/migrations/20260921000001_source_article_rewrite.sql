-- ============================================================================
-- Pivot: gerar a partir de artigos REAIS de fontes configuradas (reescrita +
-- atribuição), não de estatísticas soltas. Ver docs/PRD.md §5 (guardrail #2
-- revisto) e docs/ARCHITECTURE.md.
--
-- Não são precisas mudanças de tabelas/enums — `sources`/`topics`/`sport_facts`/
-- `content_items` já eram genéricas o suficiente (jsonb em config/raw_data/data/
-- metadata). `sources.kind` passa a usar 'rss' em vez de 'serpapi' (é só um
-- valor de texto livre, não um enum). Só a view pública precisa de expor a
-- atribuição à fonte.
-- ============================================================================

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
  c.metadata ->> 'source_url'                        as source_url
from public.content_items c
where c.status = 'published';

grant select on public.published_articles to anon, authenticated;
