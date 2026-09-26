# CLAUDE.md — Máquina de Conteúdo

Este ficheiro é o contexto principal do projeto. Lê-o na íntegra antes de qualquer tarefa.
Documentos de apoio (lê o relevante antes de mexer numa camada):

- `docs/PRD.md` — o que estamos a construir e porquê (âmbito, princípios, critérios de sucesso).
- `docs/ARCHITECTURE.md` — desenho do sistema, fluxo de dados, o que corre no Supabase vs na API.
- `docs/DATA_MODEL.md` — esquema da base de dados Supabase (tabelas, enums, RLS).
- `docs/DESIGN.md` — identidade visual do site público (cores, tipografia, componentes).
- `docs/TASKS.md` — plano de construção por fases, com checkboxes. Trabalha por esta ordem.

## O que é

Um sistema semi-autónomo que deteta notícias reais de **futebol** em feeds RSS
configurados, **reescreve-as** (nunca inventa, nunca copia literalmente, atribui sempre
a fonte) e publica-as no **próprio site** — com **um portão de aprovação humana** antes
de qualquer publicação. Âmbito deliberadamente restrito: só futebol, só artigo, só
  fontes configuradas (com pesquisa manual de notícias na web pelo operador), só o site (nada de Shorts, posts sociais,
nem destinos externos como WordPress/YouTube/redes sociais).

## Stack

- **Base de dados / plataforma:** Supabase (Postgres, Auth, Storage, Realtime). É só isso —
  sem Edge Functions, sem Cron/Queues do Supabase (ver Arquitetura).
- **Backend de aplicação:** **FastAPI (Python)**, serviço único (`apps/api`, deploy em
  Railway/Render/Fly). Liga-se ao Supabase com a `service_role` key. Corre o seu próprio
  scheduler interno (APScheduler) que deteta tendências, pontua, gera artigos (cadeia LLM)
  e traduz os publicados — substitui por completo o que antes eram Edge Functions Deno +
  worker Node.
- **Frontend:** React + Vite + TypeScript, com **SSR** no site público (`apps/web/server.js`,
  Express + `src/entry-server.tsx` — ver Arquitetura §3). Cliente `@supabase/supabase-js` (só chave `anon`).
  TailwindCSS. TanStack Query. Serve **duas coisas**: o site público de notícias (`/`,
  `/artigo/:slug`, sem login) e o painel operacional (`/admin/*`, com login).
- **LLM:** provedor configurável no painel (`settings.ai_providers` + `model_by_step`,
  chaves no Supabase Vault) — API Anthropic ou qualquer API compatível com OpenAI, por
  passo da cadeia (`apps/api/app/llm.py`). O provedor por omissão é Claude via o proxy
  AWS com as credenciais do `.env`.
- **Site multi-língua:** pt na raiz, `/en/`, `/es/`, `/fr/` com prefixo; língua do
  visitante detetada em `apps/web/server.js` (país, depois `Accept-Language`), a
  escolha manual (cookie `lang`) passa à frente. Ver `apps/web/src/lib/i18n.ts`.

## Estrutura de pastas (alvo)

```
/apps/web            # frontend React (Vite) — site público + painel /admin
/apps/api            # backend FastAPI (Python) — deteção, pontuação, geração
/supabase/migrations # migrações SQL
/packages/shared     # tipos TypeScript partilhados (gerados do schema; só para apps/web)
/docs                # os documentos acima
```

## Guardrails — regras que NÃO se violam

Estas regras existem porque as plataformas penalizam ativamente conteúdo em massa
sem valor. Ignorá-las mata o projeto (desindexação no Google). Ver `docs/PRD.md` §Compliance.

1. **Nunca publicar sem aprovação humana — ou sem o piloto automático ligado por um
   humano.** Todo o conteúdo termina em `pending_review`. Aprovar no dashboard É o ato de
   publicar (não há passo externo depois). Fora do piloto automático, não construir
   nenhum caminho que marque `content_items.status='published'` sem um `auth.uid()`
   humano — isso é imposto na base de dados (`enforce_review_gate`).
   **Exceção deliberada (Fase 6, `docs/TASKS.md`):** com `settings.autopilot.enabled=true`,
   o backend (`service_role`, nunca outra chave) pode publicar sem `auth.uid()` — a
   decisão humana passa a ser ligar o interruptor (por lote), não aprovar cada peça.
   Por omissão só publica sozinho o que o motor editorial validou sem reservas
   (originalidade `pass`, auditoria `aprovado`); tudo o resto fica em `pending_review`
   para um humano ver em `/admin/automacao`.
   **Alargamento deliberado (Fase 7, 2026-09-25):** o operador pediu explicitamente
   que este rigor fosse configurável no painel — `settings.autopilot_policy`
   (`min_originality: pass|review`, `min_audit: aprovado|rever`). O valor por omissão
   continua o mais rigoroso; aceitar `review`/`rever` é uma escolha do operador no
   painel, avisada no ecrã. `block`/`bloquear` nunca publicam, em nenhum nível, e o
   requisito de `service_role` mantém-se. Não alargar mais (ex.: publicar
   `block`, permitir outra chave que não a `service_role`, mudar o omisso para
   `review`) sem o utilizador pedir explicitamente.
   **Traduções (Fase 7):** as versões en/es/fr de um artigo publicado ficam visíveis
   sem nova aprovação — derivam do texto pt que já foi aprovado, e só aparecem se
   passarem o portão de originalidade contra a fonte (`services/translate.py`).
   Deixam de aparecer se o pt for retirado.
2. **Nunca inventar.** Todo o artigo é a reescrita de uma notícia real, já publicada por
   uma fonte RSS configurada ou descoberta por pesquisa manual do operador (Brave News,
   botão em Tendências; nunca como pesquisa automática irrestrita) — o texto original vive em
   `sport_facts`. O LLM reformula nas próprias palavras (nunca copia frases inteiras) e a
   atribuição (`metadata.source_name`/`source_url`) é gravada diretamente pelo backend,
   nunca deixada ao critério do LLM escrevê-la no corpo — tem de aparecer sempre, no
   cartão de revisão e no artigo publicado.
3. **Variação obrigatória.** Não gerar conteúdo a partir de um template rígido idêntico.
   Ângulo, estrutura e tom variam entre peças (ver `apps/api/app/services/articles.py`).
4. **Segredos nunca no código nem no repositório.** Usar variáveis de ambiente e o
   Supabase Vault. O `service_role` key só existe em `apps/api`.
5. **RLS ligado em todas as tabelas.** O frontend usa a chave `anon` + sessão de utilizador
   (para o painel) — e a mesma chave `anon`, sem sessão, para o site público, que só vê a
   view `published_articles`.

## Comandos

```bash
# frontend (site público + painel /admin)
cd apps/web && pnpm dev

# backend
cd apps/api && uvicorn app.main:app --reload

# supabase local
supabase start
supabase db diff -f <nome_da_migracao>   # gerar migração a partir de alterações
supabase db push                          # aplicar migrações
```

## Convenções

- TypeScript (`strict: true`) no frontend; Python com type hints no backend.
- Prosa/UI em português; identificadores, tabelas, colunas e código em inglês.
- Tipos da base de dados gerados com `supabase gen types typescript` para `packages/shared`.
- Commits pequenos e por camada. Uma tarefa do `TASKS.md` = um conjunto coeso de commits.
- Antes de escrever código numa camada, confirma o contrato em `DATA_MODEL.md` e `ARCHITECTURE.md`.
