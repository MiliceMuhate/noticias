-- ============================================================================
-- Migração inicial: enums + tabelas (ver docs/DATA_MODEL.md)
-- ============================================================================

-- Enums -----------------------------------------------------------------------

create type topic_status   as enum ('detected','scored','approved_for_gen','rejected','processing');
create type content_type   as enum ('article','short','social_post');
create type content_status as enum ('draft','pending_review','approved','rejected','publishing','published','failed');
create type channel_kind   as enum ('wordpress','youtube','x','instagram','linkedin');
create type job_status     as enum ('queued','running','done','failed');

-- Tabelas ---------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'operator' check (role in ('operator','admin')),
  created_at timestamptz not null default now()
);

create table public.sources (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,          -- 'serpapi' | 'apify' | 'google_trends' | ...
  niche      text not null,          -- ex.: 'football'
  config     jsonb not null default '{}'::jsonb,  -- região, categorias, keywords
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.topics (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references public.sources (id) on delete cascade,
  term        text not null,
  region      text not null,         -- ISO 3166 (ex.: 'MZ', 'PT')
  category    text,
  score       numeric,
  momentum    text check (momentum in ('rising','peaked','falling')),
  status      topic_status not null default 'detected',
  raw_data    jsonb,                 -- resposta bruta da fonte (auditoria)
  detected_at timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index topics_status_idx      on public.topics (status);
create index topics_source_id_idx   on public.topics (source_id);
create index topics_detected_at_idx on public.topics (detected_at desc);
-- evita duplicados do mesmo termo/região/fonte no mesmo dia (UTC)
create unique index topics_daily_uniq
  on public.topics (source_id, term, region, ((detected_at at time zone 'utc')::date));

create table public.sport_facts (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references public.topics (id) on delete cascade,
  provider   text not null,          -- ex.: 'football_data'
  data       jsonb not null,         -- resultados, calendário, estatísticas
  source_url text,
  fetched_at timestamptz not null default now()
);

create index sport_facts_topic_id_idx on public.sport_facts (topic_id);

create table public.content_items (
  id            uuid primary key default gen_random_uuid(),
  topic_id      uuid not null references public.topics (id) on delete cascade,
  type          content_type not null,
  status        content_status not null default 'draft',
  title         text,
  body          text,                -- markdown (artigo) ou script (short/social)
  media_url     text,
  author        text,                -- sinal E-E-A-T
  metadata      jsonb not null default '{}'::jsonb,  -- SEO, tags, variação
  review_note   text,
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  published_url text
);

create index content_items_status_idx   on public.content_items (status);
create index content_items_topic_id_idx on public.content_items (topic_id);
create index content_items_type_idx     on public.content_items (type);

create table public.channels (
  id         uuid primary key default gen_random_uuid(),
  kind       channel_kind not null,
  name       text not null,
  -- segredos por referência ao Vault (nome do secret), nunca em claro
  config     jsonb not null default '{}'::jsonb,
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,     -- 'generate-article' | 'generate-short' | 'publish' | ...
  content_item_id uuid references public.content_items (id) on delete set null,
  topic_id        uuid references public.topics (id) on delete set null,
  payload         jsonb not null default '{}'::jsonb,
  status          job_status not null default 'queued',
  attempts        int not null default 0,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index jobs_status_idx on public.jobs (status);

create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid references public.profiles (id),  -- null = sistema
  action     text not null,          -- 'approve' | 'reject' | 'publish' | 'edit' | ...
  entity     text not null,          -- 'content_item' | 'topic' | ...
  entity_id  uuid not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id);

create table public.settings (
  key   text primary key,            -- 'scoring_weights' | 'auto_approve_gen' | ...
  value jsonb not null
);

-- updated_at automático ---------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger topics_set_updated_at
  before update on public.topics
  for each row execute function public.set_updated_at();

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();
