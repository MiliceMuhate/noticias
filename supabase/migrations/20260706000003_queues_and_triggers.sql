-- ============================================================================
-- Filas (pgmq) + triggers de transição de estado + guardas do portão humano.
-- Fluxo (ver docs/ARCHITECTURE.md):
--   topics.status → 'approved_for_gen'  ⇒ enfileira em gen_queue
--   content_items.status → 'approved'   ⇒ enfileira em publish_queue
-- ============================================================================

create extension if not exists pgmq;

select pgmq.create('gen_queue');
select pgmq.create('publish_queue');

-- Wrappers RPC para o worker (supabase-js só chama funções no schema public).
-- EXECUTE só para service_role — o cliente do dashboard nunca toca nas filas.

create or replace function public.queue_send(queue_name text, message jsonb)
returns bigint
language sql
security definer
set search_path = public, pgmq
as $$
  select pgmq.send(queue_name, message);
$$;

create or replace function public.queue_read(queue_name text, vt integer default 60, qty integer default 5)
returns setof pgmq.message_record
language sql
security definer
set search_path = public, pgmq
as $$
  select * from pgmq.read(queue_name, vt, qty);
$$;

create or replace function public.queue_delete(queue_name text, msg_id bigint)
returns boolean
language sql
security definer
set search_path = public, pgmq
as $$
  select pgmq.delete(queue_name, msg_id);
$$;

create or replace function public.queue_archive(queue_name text, msg_id bigint)
returns boolean
language sql
security definer
set search_path = public, pgmq
as $$
  select pgmq.archive(queue_name, msg_id);
$$;

revoke execute on function public.queue_send(text, jsonb)             from public, anon, authenticated;
revoke execute on function public.queue_read(text, integer, integer)  from public, anon, authenticated;
revoke execute on function public.queue_delete(text, bigint)          from public, anon, authenticated;
revoke execute on function public.queue_archive(text, bigint)         from public, anon, authenticated;

grant execute on function public.queue_send(text, jsonb)              to service_role;
grant execute on function public.queue_read(text, integer, integer)   to service_role;
grant execute on function public.queue_delete(text, bigint)           to service_role;
grant execute on function public.queue_archive(text, bigint)          to service_role;

-- ----------------------------------------------------------------------------
-- GUARDA (guardrail #1): nenhum cliente marca conteúdo como publicado, e a
-- transição para 'approved' exige um utilizador humano autenticado.
-- O worker (service_role) publica; humanos aprovam; nunca o contrário.
-- ----------------------------------------------------------------------------

create or replace function public.enforce_review_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.role(), current_user);
begin
  if old.status is distinct from new.status then

    -- publicar/em publicação: só o sistema (worker/edge com service_role)
    if new.status in ('publishing','published')
       and jwt_role not in ('service_role','postgres','supabase_admin') then
      raise exception 'REVIEW GATE: só o sistema pode marcar conteúdo como % (nunca o cliente)', new.status;
    end if;

    -- aprovar: só um humano autenticado, e só a partir de pending_review
    if new.status = 'approved' then
      if auth.uid() is null then
        raise exception 'REVIEW GATE: aprovação exige um utilizador humano autenticado';
      end if;
      if old.status <> 'pending_review' then
        raise exception 'REVIEW GATE: só se aprova conteúdo em pending_review (estado atual: %)', old.status;
      end if;
    end if;

    -- publicar: só a partir de approved/publishing (nunca saltar a revisão)
    if new.status = 'published' and old.status not in ('approved','publishing') then
      raise exception 'REVIEW GATE: published exige aprovação prévia (estado atual: %)', old.status;
    end if;

  end if;
  return new;
end;
$$;

create trigger content_items_review_gate
  before update on public.content_items
  for each row execute function public.enforce_review_gate();

-- ----------------------------------------------------------------------------
-- topics → approved_for_gen: cria job + enfileira em gen_queue
-- ----------------------------------------------------------------------------

create or replace function public.enqueue_generation()
returns trigger
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  new_job_id uuid;
begin
  if new.status = 'approved_for_gen'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then

    insert into public.jobs (type, topic_id, payload)
    values ('generate-article', new.id, jsonb_build_object('topic_id', new.id, 'term', new.term))
    returning id into new_job_id;

    perform pgmq.send('gen_queue', jsonb_build_object(
      'job_id',   new_job_id,
      'job_type', 'generate-article',
      'topic_id', new.id
    ));
  end if;
  return new;
end;
$$;

create trigger topics_enqueue_generation
  after insert or update on public.topics
  for each row execute function public.enqueue_generation();

-- ----------------------------------------------------------------------------
-- content_items → approved: cria job + enfileira em publish_queue.
-- Este trigger só dispara DEPOIS de o review gate acima validar a transição,
-- por isso todo o item aqui enfileirado passou por aprovação humana.
-- ----------------------------------------------------------------------------

create or replace function public.enqueue_publication()
returns trigger
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  new_job_id uuid;
begin
  if new.status = 'approved' and old.status is distinct from new.status then

    insert into public.jobs (type, content_item_id, topic_id, payload)
    values ('publish', new.id, new.topic_id, jsonb_build_object('content_item_id', new.id, 'type', new.type))
    returning id into new_job_id;

    perform pgmq.send('publish_queue', jsonb_build_object(
      'job_id',          new_job_id,
      'job_type',        'publish',
      'content_item_id', new.id
    ));

    -- rasto de sistema: a aprovação humana é registada pelo dashboard;
    -- aqui registamos o enfileiramento automático.
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'enqueue_publish', 'content_item', new.id,
            jsonb_build_object('job_id', new_job_id));
  end if;
  return new;
end;
$$;

create trigger content_items_enqueue_publication
  after update on public.content_items
  for each row execute function public.enqueue_publication();
