-- ============================================================================
-- Piloto automático: um interruptor (settings.autopilot) que deixa o backend
-- gerar E publicar sozinho, sem clique por artigo, enquanto estiver ligado.
-- Ligar o interruptor é o ato humano que substitui a aprovação por artigo —
-- continua a ser uma decisão humana autenticada (RLS de settings exige
-- is_operator()); o que muda é que deixa de haver um humano a validar CADA
-- peça antes de publicar. Só o backend (service_role), e só com o interruptor
-- ligado, ganha esta exceção ao guardrail #1 — o caminho manual (dashboard,
-- auth.uid() humano) fica exatamente como estava.
-- ============================================================================

insert into public.settings (key, value) values
  ('autopilot', '{"enabled": false, "auto_published_streak": 0}'::jsonb)
on conflict (key) do nothing;

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
  autopilot_on boolean;
begin
  if old.status is distinct from new.status then

    if new.status = 'published' then
      if auth.uid() is null then
        select coalesce((value ->> 'enabled')::boolean, false) into autopilot_on
          from public.settings where key = 'autopilot';
        if not (auth.role() = 'service_role' and coalesce(autopilot_on, false)) then
          raise exception 'REVIEW GATE: publicar exige um utilizador humano autenticado (ou o piloto automático ligado)';
        end if;
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

-- audita quem/o quê publicou cada peça — 'auto_publish' quando foi o piloto
-- automático (sem auth.uid()), 'approve' quando foi um humano no dashboard.
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
    values (
      auth.uid(),
      case when auth.uid() is null then 'auto_publish' else 'approve' end,
      'content_item',
      new.id,
      jsonb_build_object('published_url', new.published_url, 'actor_role', auth.role())
    );

  end if;
  return new;
end;
$$;
