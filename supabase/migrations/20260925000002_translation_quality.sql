-- ============================================================================
-- Qualidade das traduções (docs/TASKS.md, Fase 7):
--   - audit: veredicto da auditoria de fidelidade (IA) de cada tradução
--   - revisão humana por amostragem no painel: um operador marca uma tradução
--     como revista, ou retira-a do site ('withdrawn' — o scheduler nunca a
--     volta a gerar enquanto o artigo pt não mudar)
-- ============================================================================

alter table public.content_translations
  add column if not exists audit       jsonb,
  add column if not exists reviewed_by uuid references public.profiles (id),
  add column if not exists reviewed_at timestamptz;

alter table public.content_translations drop constraint if exists content_translations_status_check;
alter table public.content_translations
  add constraint content_translations_status_check
  check (status in ('ready', 'blocked', 'failed', 'withdrawn'));

-- Única escrita do painel em content_translations: marcar como revista,
-- retirar ou repor. Sem UPDATE direto por RLS — assim o painel não consegue
-- mudar o texto de uma tradução nem pô-la 'ready' se ela estiver bloqueada.
create or replace function public.review_translation(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  if not public.is_operator() then
    raise exception 'só operadores podem rever traduções';
  end if;

  select status into current_status from public.content_translations where id = p_id;
  if current_status is null then
    raise exception 'tradução % não existe', p_id;
  end if;

  if p_action = 'ok' then
    if current_status <> 'ready' then
      raise exception 'só se marca como revista uma tradução publicada (estado atual: %)', current_status;
    end if;
    update public.content_translations set reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  elsif p_action = 'withdraw' then
    if current_status <> 'ready' then
      raise exception 'só se retira uma tradução publicada (estado atual: %)', current_status;
    end if;
    update public.content_translations
      set status = 'withdrawn', reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_id;
  elsif p_action = 'restore' then
    if current_status <> 'withdrawn' then
      raise exception 'só se repõe uma tradução retirada (estado atual: %)', current_status;
    end if;
    update public.content_translations
      set status = 'ready', reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_id;
  else
    raise exception 'ação desconhecida: %', p_action;
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'translation_' || p_action, 'content_translation', p_id, '{}'::jsonb);
end;
$$;

revoke all on function public.review_translation(uuid, text) from public, anon;
grant execute on function public.review_translation(uuid, text) to authenticated;

-- passo novo da cadeia (auditoria de fidelidade das traduções) no mesmo modelo
-- que já estiver configurado para 'translate', se houver
update public.settings
  set value = value || jsonb_build_object('translate_audit', coalesce(value -> 'translate', value -> 'self_audit'))
  where key = 'model_by_step' and not (value ? 'translate_audit') and (value ? 'translate' or value ? 'self_audit');
