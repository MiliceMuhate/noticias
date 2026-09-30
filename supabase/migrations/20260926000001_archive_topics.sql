-- Arquivar tendências sem remover jobs, factos ou artigos associados.
-- O índice diário de deduplicação mantém-se: arquivar não faz o RSS reler
-- a mesma notícia repetidamente no mesmo dia.
alter table public.topics add column if not exists archived_at timestamptz;

create index if not exists topics_visible_detected_at_idx
  on public.topics (detected_at desc) where archived_at is null;

create or replace function public.archive_finished_topics()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  archived_count integer;
begin
  if not public.is_operator() then
    raise exception 'só operadores podem arquivar tendências';
  end if;

  -- Deixar a fila e o trabalho em curso intactos. `generated` pode ter um
  -- artigo publicado: o arquivo afeta só a visibilidade da tendência.
  update public.topics
  set archived_at = now()
  where archived_at is null
    and status in ('scored', 'rejected', 'failed', 'generated');

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

revoke all on function public.archive_finished_topics() from public, anon;
grant execute on function public.archive_finished_topics() to authenticated;

create or replace function public.restore_archived_topics()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  restored_count integer;
begin
  if not public.is_operator() then
    raise exception 'só operadores podem restaurar tendências';
  end if;

  update public.topics set archived_at = null where archived_at is not null;
  get diagnostics restored_count = row_count;
  return restored_count;
end;
$$;

revoke all on function public.restore_archived_topics() from public, anon;
grant execute on function public.restore_archived_topics() to authenticated;
