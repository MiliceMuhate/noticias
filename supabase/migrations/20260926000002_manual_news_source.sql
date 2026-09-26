-- Fonte técnica da pesquisa manual. Desligada: o scheduler só consulta RSS
-- configurados e a pesquisa Brave só corre após ação explícita do operador.
insert into public.sources (id, kind, niche, config, enabled)
values (
  'c23bb071-1fe0-43d9-8402-014d84b2e855',
  'manual_search',
  'football',
  '{"provider":"brave_news"}'::jsonb,
  false
)
on conflict (id) do nothing;
