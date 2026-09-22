-- ============================================================================
-- docs/publicador — motor editorial de 6 passos: autoria estruturada (AUTHORS.md
-- §1), limites de ritmo no portão de aprovação (EDITORIAL.md §9).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. content_items.author: de texto simples para objeto estruturado
--    {byline, desk, editor, ai_assisted} — ver docs/publicador/AUTHORS.md §1.
--    Linhas existentes (se houver) ficam com o texto antigo como `byline`.
--    A view precisa de ser largada primeiro — depende da coluna como texto, e o
--    Postgres não deixa mudar o tipo de uma coluna usada por uma view. Recriada
--    já a seguir, com a forma nova.
-- ----------------------------------------------------------------------------

drop view if exists public.published_articles;

alter table public.content_items
  alter column author type jsonb
  using (case when author is null then null else jsonb_build_object('byline', author) end);

-- ----------------------------------------------------------------------------
-- 2. published_articles: expõe byline/desk/editor/ai_assisted/dek separados
--    (nunca o objeto bruto) — para o bloco de autoria e a divulgação de IA.
-- ----------------------------------------------------------------------------

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
  t.category
from public.content_items c
join public.topics t on t.id = c.topic_id
where c.status = 'published';

grant select on public.published_articles to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Limites de ritmo no portão de aprovação (docs/publicador/EDITORIAL.md §9).
--    Só os dois limites verificáveis por contagem direta nesta passagem
--    (max_published_per_day, min_minutes_between_publications) — ver nota no
--    plano: max_per_source_per_day e require_manual_edit_every_n ficam para
--    depois (o painel já impede o último do lado do operador).
-- ----------------------------------------------------------------------------

create or replace function public.enforce_review_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  limits jsonb;
  max_per_day int;
  min_minutes int;
  published_today int;
  last_published timestamptz;
begin
  if old.status is distinct from new.status then

    if new.status = 'published' then
      if auth.uid() is null then
        raise exception 'REVIEW GATE: publicar exige um utilizador humano autenticado';
      end if;
      if old.status <> 'pending_review' then
        raise exception 'REVIEW GATE: só se publica conteúdo em pending_review (estado atual: %)', old.status;
      end if;

      select value into limits from public.settings where key = 'publishing_limits';
      if limits is not null then
        max_per_day := coalesce((limits ->> 'max_published_per_day')::int, 1000000);
        min_minutes := coalesce((limits ->> 'min_minutes_between_publications')::int, 0);

        select count(*) into published_today
          from public.content_items
          where status = 'published' and published_at > now() - interval '24 hours';
        if published_today >= max_per_day then
          raise exception 'REVIEW GATE: limite diário de publicações atingido (% de %)', published_today, max_per_day;
        end if;

        select max(published_at) into last_published from public.content_items where status = 'published';
        if last_published is not null and min_minutes > 0
           and last_published > now() - (min_minutes || ' minutes')::interval then
          raise exception 'REVIEW GATE: intervalo mínimo entre publicações ainda não passou (% min)', min_minutes;
        end if;
      end if;
    end if;

    if new.status = 'rejected' and old.status <> 'pending_review' then
      raise exception 'REVIEW GATE: só se rejeita conteúdo em pending_review (estado atual: %)', old.status;
    end if;

  end if;
  return new;
end;
$$;
