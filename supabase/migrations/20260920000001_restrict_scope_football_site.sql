-- ============================================================================
-- Restringe o âmbito a notícias de futebol publicadas no próprio site.
-- Substitui Edge Functions + worker Node por um único backend FastAPI (apps/api),
-- que corre o próprio scheduler — por isso deixam de ser precisos pgmq/pg_cron→edge.
-- "Aprovar" passa a ser o próprio ato de publicar (não há canal externo).
-- Ver docs/ARCHITECTURE.md e docs/DATA_MODEL.md (reescritos nesta mudança).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Desligar cron → Edge Functions (o scheduler passa a viver dentro do FastAPI)
-- ----------------------------------------------------------------------------

do $$
begin
  perform cron.unschedule('detect-trends');
exception when others then
  raise notice 'cron job detect-trends não existia — a ignorar';
end $$;

do $$
begin
  perform cron.unschedule('score-topics');
exception when others then
  raise notice 'cron job score-topics não existia — a ignorar';
end $$;

drop function if exists public.invoke_edge_function(text);

-- ----------------------------------------------------------------------------
-- 2. Remover as filas (pgmq) e os triggers que enfileiravam
-- ----------------------------------------------------------------------------

drop trigger if exists topics_enqueue_generation on public.topics;
drop function if exists public.enqueue_generation();

drop trigger if exists content_items_enqueue_publication on public.content_items;
drop function if exists public.enqueue_publication();

drop function if exists public.queue_send(text, jsonb);
drop function if exists public.queue_read(text, integer, integer);
drop function if exists public.queue_delete(text, bigint);
drop function if exists public.queue_archive(text, bigint);

do $$
begin
  perform pgmq.drop_queue('gen_queue');
  perform pgmq.drop_queue('publish_queue');
exception when others then
  raise notice 'filas pgmq já não existiam — a ignorar';
end $$;

drop extension if exists pgmq;

-- ----------------------------------------------------------------------------
-- 3. content_status: só pending_review → published | rejected
--    (aprovar = publicar; já não há approved/publishing/failed separados)
-- ----------------------------------------------------------------------------

alter table public.content_items alter column status drop default;

alter type content_status rename to content_status_old;
create type content_status as enum ('pending_review', 'published', 'rejected');

alter table public.content_items
  alter column status type content_status
  using (
    case status::text
      when 'draft'          then 'pending_review'
      when 'pending_review'  then 'pending_review'
      when 'approved'        then 'published'
      when 'publishing'      then 'published'
      when 'published'       then 'published'
      when 'failed'          then 'pending_review'
      when 'rejected'        then 'rejected'
    end
  )::content_status;

alter table public.content_items alter column status set default 'pending_review';
drop type content_status_old;

-- ----------------------------------------------------------------------------
-- 4. content_items: só existe um tipo de peça (artigo) — remove `type`
-- ----------------------------------------------------------------------------

alter table public.content_items drop column type;
drop type if exists content_type;

-- ----------------------------------------------------------------------------
-- 5. channels: sem destinos externos — a "publicação" é sempre o próprio site
-- ----------------------------------------------------------------------------

drop table if exists public.channels;
drop type if exists channel_kind;

-- ----------------------------------------------------------------------------
-- 6. Portão de revisão (guardrail #1), ajustado aos novos estados
-- ----------------------------------------------------------------------------

create or replace function public.enforce_review_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then

    if new.status = 'published' then
      if auth.uid() is null then
        raise exception 'REVIEW GATE: publicar exige um utilizador humano autenticado';
      end if;
      if old.status <> 'pending_review' then
        raise exception 'REVIEW GATE: só se publica conteúdo em pending_review (estado atual: %)', old.status;
      end if;
    end if;

    if new.status = 'rejected' and old.status <> 'pending_review' then
      raise exception 'REVIEW GATE: só se rejeita conteúdo em pending_review (estado atual: %)', old.status;
    end if;

  end if;
  return new;
end;
$$;

-- renomeia o trigger existente para garantir que corre ANTES do de publicação
-- abaixo (Postgres corre triggers BEFORE pela ordem alfabética do nome).
alter trigger content_items_review_gate on public.content_items rename to a10_review_gate;

-- ----------------------------------------------------------------------------
-- 7. Publicar = calcular slug/URL do site + registar audit_log
--    (antes disto era `enqueue_publication`, que só enfileirava para um worker)
-- ----------------------------------------------------------------------------

create or replace function public.publish_content_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_slug text;
  final_slug text;
begin
  if new.status = 'published' and old.status is distinct from new.status then

    candidate_slug := nullif(
      trim(both '-' from regexp_replace(lower(coalesce(new.metadata ->> 'slug', new.title, '')), '[^a-z0-9]+', '-', 'g')),
      ''
    );
    if candidate_slug is null then
      candidate_slug := new.id::text;
    end if;

    final_slug := candidate_slug;
    if exists (
      select 1 from public.content_items
      where id <> new.id and published_url = '/artigo/' || candidate_slug
    ) then
      final_slug := candidate_slug || '-' || substr(new.id::text, 1, 8);
    end if;

    new.published_at := coalesce(new.published_at, now());
    new.published_url := '/artigo/' || final_slug;

    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'approve', 'content_item', new.id, jsonb_build_object('published_url', new.published_url));

  end if;
  return new;
end;
$$;

create trigger a20_publish_on_approve
  before update on public.content_items
  for each row execute function public.publish_content_item();

create unique index if not exists content_items_published_url_uniq
  on public.content_items (published_url)
  where status = 'published';

-- ----------------------------------------------------------------------------
-- 8. Leitura pública das notícias publicadas (view com só colunas seguras;
--    corre com os privilégios do dono — não do anon — por isso não fica sujeita
--    à RLS de content_items, que continua fechada a operator/admin).
-- ----------------------------------------------------------------------------

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
  coalesce(c.metadata -> 'tags', '[]'::jsonb)        as tags
from public.content_items c
where c.status = 'published';

grant select on public.published_articles to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. Storage: sem Shorts — o bucket `video` fica sem uso
-- ----------------------------------------------------------------------------

-- nota: o Supabase hospedado bloqueia DELETE direto em storage.objects/storage.buckets
-- ("Use the Storage API instead") — não dá para apagar o bucket por SQL/migração.
-- Remove-o à mão no dashboard (Storage → bucket "video" → Delete) se quiseres, ou
-- via `supabase storage rm` — não é necessário para o funcionamento do sistema, só
-- deixa de ser referenciado por qualquer código a partir daqui.
drop policy if exists "video: operator read" on storage.objects;
