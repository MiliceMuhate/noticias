-- ============================================================================
-- RLS: ligado em TODAS as tabelas (guardrail #5).
-- Frontend usa anon + sessão; worker/Edge Functions usam service_role (bypassa RLS).
-- Ver docs/DATA_MODEL.md §Notas de RLS.
-- ============================================================================

-- Helper: o utilizador autenticado é operador/admin?
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('operator','admin')
  );
$$;

-- Helper: o utilizador autenticado é admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Auto-criar profile no signup ------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Ligar RLS ---------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.sources       enable row level security;
alter table public.topics        enable row level security;
alter table public.sport_facts   enable row level security;
alter table public.content_items enable row level security;
alter table public.channels      enable row level security;
alter table public.jobs          enable row level security;
alter table public.audit_log     enable row level security;
alter table public.settings      enable row level security;

-- profiles: cada um lê/edita a sua linha; admin lê todas -------------------------

create policy "profiles: own row select" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles: own row update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Tabelas operacionais: SELECT/UPDATE para operator/admin autenticado.
-- INSERTs do sistema chegam via service_role (bypassa RLS).

-- sources / channels / settings: operador também pode configurar (insert/delete)

create policy "sources: operator select" on public.sources
  for select to authenticated using (public.is_operator());
create policy "sources: operator insert" on public.sources
  for insert to authenticated with check (public.is_operator());
create policy "sources: operator update" on public.sources
  for update to authenticated using (public.is_operator());
create policy "sources: operator delete" on public.sources
  for delete to authenticated using (public.is_operator());

create policy "channels: operator select" on public.channels
  for select to authenticated using (public.is_operator());
create policy "channels: operator insert" on public.channels
  for insert to authenticated with check (public.is_operator());
create policy "channels: operator update" on public.channels
  for update to authenticated using (public.is_operator());
create policy "channels: operator delete" on public.channels
  for delete to authenticated using (public.is_operator());

create policy "settings: operator select" on public.settings
  for select to authenticated using (public.is_operator());
create policy "settings: operator upsert" on public.settings
  for insert to authenticated with check (public.is_operator());
create policy "settings: operator update" on public.settings
  for update to authenticated using (public.is_operator());

-- topics / content_items: leitura e atualização (aprovar/rejeitar/editar)

create policy "topics: operator select" on public.topics
  for select to authenticated using (public.is_operator());
create policy "topics: operator update" on public.topics
  for update to authenticated using (public.is_operator());

create policy "content_items: operator select" on public.content_items
  for select to authenticated using (public.is_operator());
create policy "content_items: operator update" on public.content_items
  for update to authenticated using (public.is_operator());

-- sport_facts / jobs: leitura apenas (escrita só pelo sistema)

create policy "sport_facts: operator select" on public.sport_facts
  for select to authenticated using (public.is_operator());

create policy "jobs: operator select" on public.jobs
  for select to authenticated using (public.is_operator());

-- audit_log: append-only a partir do cliente (sem UPDATE/DELETE por ninguém)

create policy "audit_log: operator select" on public.audit_log
  for select to authenticated using (public.is_operator());
create policy "audit_log: operator insert" on public.audit_log
  for insert to authenticated
  with check (public.is_operator() and actor = auth.uid());
-- (nenhuma policy de UPDATE/DELETE = proibido para clientes)
