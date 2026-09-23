-- ============================================================================
-- Distinguir publicação automática (piloto) de manual (humano) em
-- content_items, para o painel mostrar isso na Fila de revisão. "Remover
-- publicação" em si não precisa de mudança na BD: enforce_review_gate só
-- valida transições PARA 'published'/'rejected' — published → pending_review
-- já passava livre (continua a exigir sessão de operador via RLS).
-- ============================================================================

alter table public.content_items
  add column if not exists published_via text check (published_via in ('manual', 'auto'));

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
    new.published_via := case when auth.uid() is null then 'auto' else 'manual' end;

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
