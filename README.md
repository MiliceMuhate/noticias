# Máquina de Conteúdo

**Engineering overview (EN):** Personal full-stack project combining FastAPI, React, Supabase/PostgreSQL, Docker, RSS ingestion, AI-assisted editorial review, and signed GitHub-webhook deployments. The application supports manual review and an optional policy-gated autopilot mode. See [architecture](docs/ARCHITECTURE.md) and [deployment](deploy/README.md).


Sistema semi-autónomo que deteta notícias reais de **futebol** em feeds RSS
configurados, reescreve-as (nunca inventa, atribuição sempre visível) e publica-as
no **próprio site** — com revisão humana por omissão ou publicação automática
condicionada a políticas de qualidade quando o piloto automático está ativo. Ver `docs/` (PRD, ARCHITECTURE, DATA_MODEL, DESIGN, TASKS) e
`.claude/CLAUDE.md` para o contexto completo.

## Estrutura

```
/apps/web            # React (Vite) — site público de notícias + painel /admin
/apps/api            # backend FastAPI (Python) — deteção, pontuação, geração
/supabase/migrations # migrações SQL (enums, tabelas, RLS, storage)
/packages/shared     # tipos da BD partilhados com apps/web
/docs                # PRD, ARCHITECTURE, DATA_MODEL, TASKS
```

## Arranque local

Pré-requisitos: Node ≥20, pnpm 9, Python ≥3.11, [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker.

```bash
pnpm install

# 1. Supabase local (aplica migrações + seed automaticamente)
supabase start

# 2. Backend (deteção, pontuação, geração — corre o seu próprio scheduler)
cd apps/api
python -m venv .venv && .venv/Scripts/activate   # Unix: source .venv/bin/activate
pip install -e .
cp .env.example .env                               # preenche as chaves (URL/keys impressos por `supabase start`)
uvicorn app.main:app --reload

# 3. Site + painel
cd apps/web && cp .env.example .env.local           # preenche URL + anon key
pnpm dev                                             # http://localhost:5173

# 4. Cria o utilizador operador no Studio (Auth → Add user).
#    O profile é criado automaticamente com role 'operator'. Login em /admin.
```

## Fluxo (notícia real → artigo publicado)

```
apps/api (scheduler interno) → deteta artigos novos em feeds RSS configurados → topics(scored/approved_for_gen)
     → reescreve o artigo real (nunca inventa, nunca copia) + Claude → content_items(pending_review)
     → APROVAÇÃO HUMANA em /admin OU piloto automático condicionado à política de qualidade
     → trigger na BD publica (slug + published_url + audit_log)
     → artigo visível em /artigo/:slug, com "Fonte: ..." sempre visível, sem login
```

## Guardrails (não se violam — ver CLAUDE.md)

1. No modo manual, a publicação exige aprovação humana. O piloto automático, quando ativado, pode publicar apenas conteúdo que cumpra a política configurada; itens bloqueados permanecem para revisão.
2. Nunca inventar: todo o artigo é reescrita de uma notícia real de uma fonte RSS
   configurada (`sport_facts`), nunca pesquisa aberta; atribuição sempre visível.
3. Variação obrigatória de ângulo/estrutura/tom entre peças.
4. Segredos só em variáveis de ambiente (`apps/api/.env`, `apps/web/.env.local`).
5. RLS ligado em todas as tabelas; o frontend só tem a chave `anon`.

## Comandos úteis

```bash
pnpm typecheck            # typecheck de apps/web + packages/shared
pnpm gen:types             # regenerar tipos da BD (supabase gen types → packages/shared)
supabase db reset          # reaplicar migrações + seed
```

## Deploy (produção)

Sem GitHub Actions (conta com Actions bloqueado por faturação): push para `main`
dispara um webhook do GitHub para a própria VPS, que faz `git pull`, aplica as
migrações Supabase, reconstrói as imagens Docker localmente (`apps/api`,
`apps/web`) e reinicia os containers. Setup completo em
[`deploy/README.md`](deploy/README.md).

## Estado das fases (TASKS.md)

- ✅ Fase 0 — fundações (monorepo, migrações, RLS, bucket, tipos)
- ✅ Fase 1 — backend FastAPI: deteção via RSS e pontuação
- ✅ Fase 2 — geração por reescrita de notícia real + cadeia Claude
- ✅ Fase 3 — dashboard com portão de aprovação + realtime
- ✅ Fase 4 — publicação direta no site (trigger + view pública + páginas React)