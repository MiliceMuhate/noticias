-- ============================================================================
-- Rastreio de gastos com a IA: cada `jobs` de geração passa a gravar os tokens
-- consumidos e o custo estimado, para a aba "Gastos IA" do painel.
-- Custo é uma ESTIMATIVA com base nos preços públicos da API Anthropic
-- (ver apps/api/app/pricing.py) — a chave real corre por um proxy AWS
-- empresarial, cujo tarifário pode divergir.
-- ============================================================================

alter table public.jobs
  add column if not exists input_tokens  int not null default 0,
  add column if not exists output_tokens int not null default 0,
  add column if not exists cost_usd      numeric not null default 0;
