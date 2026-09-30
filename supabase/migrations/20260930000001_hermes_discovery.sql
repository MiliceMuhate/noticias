-- ============================================================================
-- Hermes (Nous Research) como agente de DESCOBERTA de notícias — Fase 8,
-- docs/TASKS.md. O Hermes só procura notícias e cruza cada uma com outras
-- fontes; o resultado entra em `topics` como qualquer notícia de RSS e segue a
-- cadeia editorial de sempre (reescrita, portões, aprovação/piloto). O Hermes
-- nunca escreve artigos nem publica.
--
-- Isto altera deliberadamente o guardrail "só fontes configuradas (nada de
-- pesquisa aberta)", a pedido explícito do operador (2026-09-30): a pesquisa
-- fica limitada a uma lista de domínios aprovados, editável no painel.
-- ============================================================================

-- execuções do Hermes: estado, tokens e custo (aba "Hermes" do painel)
create table if not exists public.hermes_runs (
  id               uuid primary key default gen_random_uuid(),
  trigger          text not null default 'schedule' check (trigger in ('schedule', 'manual')),
  status           text not null default 'running' check (status in ('running', 'done', 'failed')),
  model            text,
  input_tokens     int not null default 0,
  output_tokens    int not null default 0,
  cost_usd         numeric(12, 6) not null default 0,
  stories_found    int not null default 0,
  stories_inserted int not null default 0,
  -- histórias devolvidas (com as fontes cruzadas) e o fim do output, para depurar
  output           jsonb,
  log_tail         text,
  error            text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);

create index if not exists hermes_runs_started_idx on public.hermes_runs (started_at desc);

alter table public.hermes_runs enable row level security;

drop policy if exists "hermes_runs: operator select" on public.hermes_runs;
create policy "hermes_runs: operator select" on public.hermes_runs
  for select to authenticated using (public.is_operator());

-- fonte que as notícias do Hermes referenciam em topics.source_id. Fica
-- enabled=false: não é lida pelo ciclo de RSS (discover_articles), o Hermes
-- tem o seu próprio ciclo (settings.hermes.enabled).
insert into public.sources (kind, niche, config, enabled)
select 'hermes', 'football', '{"note": "notícias descobertas pelo Hermes — ver settings.hermes"}'::jsonb, false
where not exists (select 1 from public.sources where kind = 'hermes');

insert into public.settings (key, value) values
  ('hermes', '{
     "enabled": false,
     "interval_min": 180,
     "max_stories": 5,
     "min_sources": 2,
     "focus": "futebol moçambicano (Moçambola, Mambas, clubes e jogadores moçambicanos), futebol africano e as principais notícias do futebol internacional",
     "allowed_domains": [
       "espn.com", "bbc.com", "skysports.com", "theguardian.com", "reuters.com", "apnews.com",
       "marca.com", "as.com", "mundodeportivo.com", "lequipe.fr", "gazzetta.it", "kicker.de",
       "record.pt", "abola.pt", "ojogo.pt", "maisfutebol.iol.pt",
       "cafonline.com", "fifa.com", "uefa.com",
       "jornalnoticias.co.mz", "opais.co.mz", "lusa.pt"
     ],
     "provider": "gemini",
     "model": "gemini-3.8-flash",
     "reasoning": "low",
     "web_backend": "keyless",
     "input_usd_per_mtok": 0.75,
     "output_usd_per_mtok": 3.75,
     "cache_read_usd_per_mtok": 0.075
   }'::jsonb)
on conflict (key) do nothing;

-- published_articles ganha `other_sources` — as outras fontes que confirmam a
-- notícia (metadata.sources, preenchido quando veio do Hermes), atribuídas no
-- artigo publicado ao lado da fonte principal (guardrail #2). Mesma definição
-- de 20260925000001, com a coluna nova.
drop view if exists public.published_articles;

create view public.published_articles as
with base as (
  select
    c.id,
    c.title,
    c.body,
    c.media_url,
    c.author ->> 'byline'                                 as author,
    c.author ->> 'editor'                                 as editor,
    c.author ->> 'desk'                                   as desk,
    coalesce((c.author ->> 'ai_assisted')::boolean, true) as ai_assisted,
    c.published_at,
    c.published_url,
    coalesce(c.metadata ->> 'slug', c.id::text)           as slug,
    c.metadata ->> 'seo_description'                      as seo_description,
    c.metadata ->> 'dek'                                  as dek,
    coalesce(c.metadata -> 'tags', '[]'::jsonb)           as tags,
    c.metadata ->> 'source_name'                          as source_name,
    c.metadata ->> 'source_url'                           as source_url,
    t.category,
    c.view_count,
    'pt'::text                                            as lang,
    coalesce(c.metadata -> 'sources', '[]'::jsonb)        as other_sources
  from public.content_items c
  join public.topics t on t.id = c.topic_id
  where c.status = 'published'
),
translated as (
  select
    b.id,
    tr.title,
    tr.body,
    b.media_url,
    b.author,
    b.editor,
    b.desk,
    b.ai_assisted,
    b.published_at,
    b.published_url,
    tr.slug,
    tr.seo_description,
    tr.dek,
    tr.tags,
    b.source_name,
    b.source_url,
    b.category,
    b.view_count,
    tr.lang,
    b.other_sources
  from base b
  join public.content_translations tr on tr.content_item_id = b.id
  where tr.status = 'ready' and tr.slug is not null
),
all_rows as (
  select * from base
  union all
  select * from translated
)
select
  r.*,
  (
    select jsonb_agg(jsonb_build_object('lang', a.lang, 'slug', a.slug) order by a.lang)
    from all_rows a
    where a.id = r.id
  ) as alternates
from all_rows r;

grant select on public.published_articles to anon, authenticated;
