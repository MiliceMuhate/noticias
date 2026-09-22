-- ============================================================================
-- Cron: dispara as Edge Functions de deteção e pontuação em intervalo.
-- Usa pg_cron + pg_net. O URL do projeto e o token vêm do Vault:
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role_key>', 'edge_invoke_key');
-- Em local (supabase start) o cron também corre; cria os secrets com o URL local.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_edge_function(fn_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  auth_key text;
begin
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into auth_key
    from vault.decrypted_secrets where name = 'edge_invoke_key' limit 1;

  if base_url is null or auth_key is null then
    raise notice 'invoke_edge_function(%): secrets project_url/edge_invoke_key em falta no Vault — a saltar', fn_name;
    return;
  end if;

  perform net.http_post(
    url     := base_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || auth_key
    ),
    body    := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.invoke_edge_function(text) from public, anon, authenticated;

-- deteção de tendências: a cada 30 minutos
select cron.schedule(
  'detect-trends',
  '*/30 * * * *',
  $$ select public.invoke_edge_function('detect-trends') $$
);

-- pontuação: a cada 10 minutos (apanha topics em 'detected')
select cron.schedule(
  'score-topics',
  '*/10 * * * *',
  $$ select public.invoke_edge_function('score-topics') $$
);
