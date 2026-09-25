-- ============================================================================
-- Fase 7 (docs/TASKS.md): site multi-língua, provedores de IA configuráveis no
-- painel, e política editorial/de publicação automática editável no painel.
--
-- 1. content_translations — uma versão por língua (en/es/fr) de cada artigo
--    publicado. O português continua a viver em content_items (é a peça que
--    um humano — ou o piloto — aprovou); as traduções derivam dela.
-- 2. published_articles passa a ter uma linha por (artigo, língua), com
--    `lang` e `alternates` (para hreflang e para o seletor de língua).
-- 3. Chaves de API dos provedores de IA no Supabase Vault — escritas pelo
--    painel via RPC (só operadores), lidas só pela service_role (backend).
-- 4. Novas chaves em settings (on conflict do nothing: o seed nunca chegou a
--    correr no projeto hosted, por isso isto tem de viver na migração).
-- ============================================================================

-- 1. traduções ----------------------------------------------------------------

create table if not exists public.content_translations (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  lang            text not null check (lang in ('en', 'es', 'fr')),
  -- ready   = visível no site (se o artigo pt estiver publicado)
  -- blocked = a tradução ficou próxima demais do original (mesma língua da fonte)
  -- failed  = erro técnico; o scheduler tenta outra vez até max_attempts
  status          text not null default 'failed' check (status in ('ready', 'blocked', 'failed')),
  title           text,
  body            text,
  dek             text,
  seo_description text,
  tags            jsonb not null default '[]'::jsonb,
  slug            text,
  -- md5(title || body) do artigo pt traduzido — se o operador editar o pt
  -- depois de publicar, o hash deixa de bater e o scheduler volta a traduzir
  source_hash     text not null,
  originality     jsonb,
  error           text,
  attempts        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (content_item_id, lang)
);

create unique index if not exists content_translations_lang_slug_uniq
  on public.content_translations (lang, slug) where slug is not null;

drop trigger if exists content_translations_set_updated_at on public.content_translations;
create trigger content_translations_set_updated_at
  before update on public.content_translations
  for each row execute function public.set_updated_at();

alter table public.content_translations enable row level security;

-- leitura para o painel; escrita só pelo backend (service_role bypassa RLS)
drop policy if exists "content_translations: operator select" on public.content_translations;
create policy "content_translations: operator select" on public.content_translations
  for select to authenticated using (public.is_operator());

-- 2. view pública ---------------------------------------------------------------
-- `id` é SEMPRE o id do content_item (a identidade do artigo, igual em todas
-- as línguas) — increment_article_view continua a receber este id e a contagem
-- de visualizações é do artigo, somada entre línguas.

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
    'pt'::text                                            as lang
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
    tr.lang
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

-- 3. chaves dos provedores de IA no Vault -----------------------------------------
-- Nome do secret: 'ai_provider_key:<provider_id>'. O painel só escreve e só vê
-- se existe (nunca o valor); o backend lê com get_ai_provider_key.

create extension if not exists supabase_vault with schema vault;

create or replace function public.set_ai_provider_key(p_provider_id text, p_key text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  secret_name text := 'ai_provider_key:' || p_provider_id;
  existing uuid;
begin
  if not public.is_operator() then
    raise exception 'só operadores podem configurar chaves de IA';
  end if;
  if p_provider_id !~ '^[a-z0-9][a-z0-9_-]{0,62}$' then
    raise exception 'id de provedor inválido: %', p_provider_id;
  end if;

  select id into existing from vault.secrets where name = secret_name;

  if p_key is null or length(trim(p_key)) = 0 then
    if existing is not null then
      delete from vault.secrets where id = existing;
    end if;
  elsif existing is null then
    perform vault.create_secret(trim(p_key), secret_name, 'Chave de API de provedor de IA (painel /admin/config)');
  else
    perform vault.update_secret(existing, trim(p_key));
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (
    auth.uid(),
    case when p_key is null or length(trim(p_key)) = 0 then 'ai_key_delete' else 'ai_key_set' end,
    'settings',
    gen_random_uuid(),
    jsonb_build_object('provider_id', p_provider_id)
  );
end;
$$;

revoke all on function public.set_ai_provider_key(text, text) from public, anon;
grant execute on function public.set_ai_provider_key(text, text) to authenticated;

-- só diz se existe e quando mudou — nunca o valor
create or replace function public.ai_provider_key_status()
returns table (provider_id text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if not public.is_operator() then
    raise exception 'só operadores';
  end if;
  return query
    select substring(s.name from length('ai_provider_key:') + 1), s.updated_at
    from vault.secrets s
    where s.name like 'ai_provider_key:%';
end;
$$;

revoke all on function public.ai_provider_key_status() from public, anon;
grant execute on function public.ai_provider_key_status() to authenticated;

-- só o backend (service_role) — nunca anon/authenticated
create or replace function public.get_ai_provider_key(p_provider_id text)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'ai_provider_key:' || p_provider_id limit 1;
$$;

revoke all on function public.get_ai_provider_key(text) from public, anon, authenticated;
grant execute on function public.get_ai_provider_key(text) to service_role;

-- 4. novas settings -------------------------------------------------------------

insert into public.settings (key, value) values
  -- provedores de IA. `use_env_credentials` = usa ANTHROPIC_API_KEY/BASE_URL/
  -- WORKSPACE_ID do .env (o provedor que já existia) em vez de uma chave do Vault.
  ('ai_providers', '{
     "default": {"provider": "anthropic-env", "model": "claude-haiku-4-5"},
     "providers": [
       {
         "id": "anthropic-env",
         "label": "Anthropic (proxy AWS, credenciais do .env)",
         "kind": "anthropic",
         "use_env_credentials": true,
         "models": [
           {"id": "claude-haiku-4-5", "input_usd_per_mtok": 1.0, "output_usd_per_mtok": 5.0},
           {"id": "claude-sonnet-5", "input_usd_per_mtok": 2.0, "output_usd_per_mtok": 10.0},
           {"id": "claude-opus-5", "input_usd_per_mtok": 5.0, "output_usd_per_mtok": 25.0}
         ]
       }
     ]
   }'::jsonb),

  -- o que o piloto automático aceita publicar sozinho. Por omissão o mais
  -- rigoroso (o comportamento de sempre). 'review'/'rever' alargam a exceção
  -- do guardrail #1 — escolha explícita do operador (ver CLAUDE.md).
  ('autopilot_policy', '{"min_originality": "pass", "min_audit": "aprovado"}'::jsonb),

  -- comportamento da cadeia editorial
  --   rewrite_on_audit_review: se a auditoria disser "rever", reescreve os
  --     trechos assinalados e audita de novo (antes só acontecia com "bloquear")
  --   audit_strictness: tolerante | normal | rigoroso — instrução ao auditor
  ('editorial_pipeline', '{"rewrite_on_audit_review": true, "audit_strictness": "normal"}'::jsonb),

  -- traduções do site público
  ('translation', '{"enabled": true, "languages": ["en", "es", "fr"], "max_attempts": 3}'::jsonb)
on conflict (key) do nothing;
