-- ============================================================================
-- Remove min_minutes_between_publications: o operador decidiu que não faz
-- sentido espaçar publicações no tempo — só o limite diário
-- (max_published_per_day) continua imposto na BD.
-- ============================================================================

create or replace function public.enforce_review_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  limits jsonb;
  max_per_day int;
  published_today int;
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

        select count(*) into published_today
          from public.content_items
          where status = 'published' and published_at > now() - interval '24 hours';
        if published_today >= max_per_day then
          raise exception 'REVIEW GATE: limite diário de publicações atingido (% de %)', published_today, max_per_day;
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
