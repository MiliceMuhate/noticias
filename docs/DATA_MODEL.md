# DATA_MODEL — Máquina de Conteúdo (Supabase / Postgres)

Convenções: `snake_case`, chaves `uuid` (default `gen_random_uuid()`), timestamps
`timestamptz` com default `now()`. **RLS ligado em todas as tabelas.** A API
(`apps/api`) usa `service_role` (bypassa RLS); o frontend usa `anon` (+ sessão no
painel `/admin`, sem sessão no site público).

## Enums

```sql
create type topic_status   as enum ('detected','scored','approved_for_gen','rejected','processing','generated','failed');
create type content_status as enum ('pending_review','published','rejected');
create type job_status     as enum ('queued','running','done','failed');
```

Não há `content_type` (só existe artigo) nem `channel_kind` (só existe um destino: o
próprio site).

## Tabelas

### `profiles`
Utilizadores do painel (1:1 com `auth.users`).

| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| email | text | |
| role | text | `'operator'` \| `'admin'` |
| created_at | timestamptz | |

### `sources`
Fontes de notícias configuradas (sempre futebol) — nunca pesquisa aberta.

| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| kind | text | `'rss'` (único provider real — ver `apps/api/app/services/news_sources.py`) |
| niche | text | `'football'` |
| config | jsonb | `url` do feed RSS, `region` (informativo), `max_items` |
| enabled | boolean | default `true` |
| created_at | timestamptz | |

### `topics`
Artigos descobertos nas fontes. Núcleo do pipeline.

| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| source_id | uuid FK → sources | |
| term | text | título do artigo descoberto |
| region | text | do `sources.config.region` (informativo) |
| category | text | nullable |
| score | numeric | calculado pelo scheduler (`score_topics`) |
| momentum | text | sempre `'rising'` para itens de RSS (são sempre "novos") |
| status | topic_status | default `'detected'`; `'failed'` é terminal — esgotou `MAX_GENERATE_ATTEMPTS` ou ficou preso em `'processing'` (backend reiniciado a meio) por mais de `STALE_PROCESSING_MINUTES`; ver `recover_stuck_topics` em `apps/api/app/scheduler.py`. O painel mostra o último erro (via `jobs.error`) e um botão "Tentar novamente" (volta a `'approved_for_gen'`) |
| raw_data | jsonb | entry do feed — **inclui sempre `link`**, o URL do artigo original (é daí que `generate_pending` vai buscar o texto real) |
| detected_at | timestamptz | |
| updated_at | timestamptz | |

Índices: `(status)`, `(source_id)`, `(detected_at desc)`. Único: `(source_id, term, region, detected_at::date)` para evitar duplicados no mesmo dia.

### `sport_facts`
O artigo-fonte real que fundamenta a reescrita (anti-invenção). **Fonte da verdade —
nunca estatísticas soltas, sempre um artigo publicado por alguém.**

| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| topic_id | uuid FK → topics | |
| provider | text | nome do site de origem (ex.: `'espn.com'`), ou `'dev-mock'` em dev |
| data | jsonb | `{title, text, facts}` — `text` é o texto extraído da página real; `facts` é a ficha de factos (P1, `docs/publicador/PROMPTS.md`) gravada depois de extraída, para idempotência numa nova tentativa |
| source_url | text | o URL do artigo original — para citar/atribuir |
| fetched_at | timestamptz | |

### `content_items`
Artigos gerados (um por `topic` gerado com sucesso).

| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| topic_id | uuid FK → topics | |
| status | content_status | default `'pending_review'` |
| title | text | |
| body | text | markdown |
| media_url | text | nullable; URL da imagem do artigo-fonte (hotlinked, nunca descarregada — ver `docs/DESIGN.md` §Imagens); não usa o bucket `media` |
| author | jsonb | `{byline, desk, editor, ai_assisted}` — autoria transparente, nunca uma pessoa fictícia (`docs/publicador/AUTHORS.md` §1); `desk` é um de `resultados`\|`transferencias`\|`analise`\|`institucional`, derivado de `facts.tipo` |
| metadata | jsonb | `seo_description`, `dek`, `tags`, `slug`, `alternativas` (2 títulos descartados), `variation` (vocabulário fechado de 7 valores, `docs/publicador/EDITORIAL.md` §4), `desk`, `trace` (parágrafo→`fact_id`s), `afirmacoes_de_contexto`, `originality` (relatório do portão, `docs/publicador/ORIGINALITY.md`), `self_audit`, `prompt_version`, `source_name`/`source_url` (atribuição — gravados diretamente pelo backend, nunca pelo texto do LLM) |
| review_note | text | nota do operador ao rejeitar/editar |
| created_at | timestamptz | |
| published_at | timestamptz | nullable; definido pelo trigger `publish_content_item`; limpo (volta a null) ao "Retirar publicação" |
| published_url | text | nullable; `'/artigo/' \|\| slug`, definido pelo mesmo trigger; idem |
| published_via | text | nullable; `'auto'`\|`'manual'` — `'auto'` quando quem publicou foi o backend com o piloto automático ligado (`auth.uid() is null`), `'manual'` quando foi um humano no dashboard; definido pelo mesmo trigger, mostrado na Fila de revisão |
| view_count | int | default `0`; incrementado pela função `increment_article_view(uuid)` (`security definer`, `grant execute` a `anon` — só sabe fazer isto, não abre UPDATE de `content_items` a visitantes), chamada por `ArticlePage.tsx` a cada visita (1×/separador via `sessionStorage`); exposto também em `published_articles.view_count` |

Índices: `(status)`, `(topic_id)`. Únicos parciais: `(published_url) where status='published'`;
`(metadata->>'source_url') where status in ('pending_review','published')` — nunca duas peças
ativas para a mesma notícia real (RSS pode relistar a mesma história com título ligeiramente
diferente, gerando dois `topics`); backstop ao nível da BD para a janela de corrida entre dois
topics distintos gerados em paralelo — `generate_article()` já verifica isto antes de gastar
LLM, isto só apanha o caso raro em que dois processos passam ambos na verificação.

"Retirar publicação" (Fila de revisão): um `update` do operador que só muda `status`
para `'pending_review'` e limpa `published_at`/`published_url`/`published_via` — não
precisa de nenhuma regra nova em `enforce_review_gate` (que só valida transições
*para* `'published'`/`'rejected'`), fica coberto pela RLS normal de `content_items`
(só operador/admin autenticado). Volta a aparecer em "Por rever".

**Aprovar é publicar.** Não há tabela `channels` nem passo de publicação externo — a
transição `pending_review → published` (só por um humano autenticado, imposta pelo
trigger `enforce_review_gate`) já É o artigo a ficar visível no site, via a view
`published_articles` abaixo.

### `jobs`
Registo de gerações (visibilidade no dashboard, retries do `apps/api`, e a base
da aba **Gastos IA** do painel).

| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| type | text | `'generate-article'` |
| content_item_id | uuid FK → content_items | nullable |
| topic_id | uuid FK → topics | nullable |
| payload | jsonb | `{"term": ...}` — usado pela UI para identificar a geração sem precisar de join |
| status | job_status | default `'queued'` |
| attempts | int | default `0`; ao chegar a `settings` (via `apps/api`), limitado por `MAX_GENERATE_ATTEMPTS` |
| error | text | nullable |
| input_tokens | int | default `0`; tokens de input somados de todas as chamadas ao LLM desta geração |
| output_tokens | int | default `0`; idem, output |
| cost_usd | numeric | default `0`; estimativa (`apps/api/app/pricing.py`, preços públicos da Anthropic — a chave real corre por um proxy AWS empresarial que pode ter tarifário diferente); gravado mesmo quando a geração falha a meio, porque os tokens já gastos custaram dinheiro na mesma |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `audit_log`
Rasto de ações (obrigatório para o portão de aprovação).

| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| actor | uuid | FK → profiles (nullable se for o sistema) |
| action | text | `'approve'` (escrito pelo trigger `publish_content_item`), `'reject'`, `'edit'` |
| entity | text | `'content_item'` |
| entity_id | uuid | |
| detail | jsonb | |
| created_at | timestamptz | |

### `settings`
Configuração global (key/value).

| coluna | tipo | notas |
|---|---|---|
| key | text PK | `'scoring_weights'`, `'score_threshold'`, `'auto_approve_gen'`, `'authors'`, `'editorial_voice'`, `'originality_thresholds'`, `'model_by_step'`, `'controlled_tags'`, `'publishing_limits'`, `'autopilot'` |
| value | jsonb | |

Chaves do motor editorial (`docs/publicador/`), todas seedadas com valores por
omissão em `supabase/seed.sql` e ajustáveis sem novo deploy:

- `authors` — `{byline, editor, ai_assisted, desks: {resultados|transferencias|analise|institucional: {beat, voice}}}`. `editor` precisa do nome real do operador antes de publicar a sério.
- `editorial_voice` — `{variant, person, register, sentence_target_words, paragraph_max_sentences, cliche_blacklist}`.
- `originality_thresholds` — limiares `{pass, block}` por métrica do portão (`docs/publicador/ORIGINALITY.md` §2); calibrar com `apps/api/scripts/calibrate_originality.py` depois dos primeiros ~20 artigos.
- `model_by_step` — modelo Anthropic por passo (`extract_facts`, `editorial_brief`, `write_article`, `package`, `self_audit`, `rewrite_flagged`); todos apontam ao mesmo modelo por omissão.
- `controlled_tags` — vocabulário fechado; P4 nunca inventa tags fora daqui.
- `publishing_limits` — `{max_published_per_day, max_per_source_per_day, require_manual_edit_every_n}`; o primeiro imposto em `enforce_review_gate` (BD), sempre, independentemente de quem publica; os outros dois não têm imposição na BD — só `scheduler.auto_publish_ready()` os respeita quando o piloto automático está ligado (uma aprovação manual avulsa no dashboard não é limitada por eles) — ver `docs/publicador/TASKS_CONTENT.md` "A perguntar depois". (Existiu também `min_minutes_between_publications` — removido a pedido do operador, 2026-09-24.)
- `autopilot` — `{enabled, auto_published_streak, started_by, started_at, stopped_by, stopped_at}`. Interruptor do piloto automático (Fase 6, `docs/TASKS.md`): com `enabled=true`, `enforce_review_gate` deixa o backend (`service_role`) publicar sem `auth.uid()` humano. Editável por qualquer operador autenticado (mesma policy de `settings`); `auto_published_streak` é escrito pelo próprio backend.

## `published_articles` (view pública)

Expõe só as colunas seguras de `content_items` publicados (nunca `review_note`,
`topic_id` ou `metadata`/`author` brutos). Dona pelo utilizador que corre as
migrações (que bypassa a RLS de `content_items`), com `grant select` a
`anon, authenticated` — é assim que o site público lê notícias sem qualquer acesso
à tabela em si.

| coluna | notas |
|---|---|
| id, title, body, media_url | do `content_items` |
| author, editor, desk, ai_assisted | extraídos de `content_items.author` (jsonb) — nunca o objeto bruto |
| published_at, published_url | idem |
| slug | `metadata->>'slug'`, com fallback ao `id` |
| seo_description, dek | `metadata->>'seo_description'`/`'dek'` |
| tags | `metadata->'tags'` |
| source_name, source_url | `metadata->>'source_name'`/`'source_url'` — atribuição, sempre mostrada no artigo publicado |
| category | `topics.category` (via join) — categoria informativa da fonte RSS, distinta de `desk` (que é a editoria, derivada dos factos) |

## Notas de RLS

- `profiles`: cada utilizador lê/edita a sua linha; `admin` lê todas.
- `sources`, `topics`, `content_items`, `sport_facts`, `jobs`, `audit_log`, `settings`:
  SELECT/UPDATE para utilizadores autenticados com `role in ('operator','admin')`.
  INSERT/mutações do sistema fazem-se via `service_role` (`apps/api`), que bypassa RLS.
- `content_items`: sem policy de SELECT para `anon` — a leitura pública passa sempre
  pela view `published_articles`, nunca pela tabela.
- `audit_log`: sem UPDATE/DELETE por ninguém a partir do cliente (append-only); o
  `INSERT` da aprovação é feito pelo trigger `publish_content_item` (`security definer`),
  não pelo cliente diretamente.
- `enforce_review_gate` (trigger em `content_items`) também impõe `settings.publishing_limits.max_published_per_day`
  na própria transição para `'published'` — um limite só no cliente não é um limite real. Desde a Fase 6, o
  mesmo trigger aceita publicar sem `auth.uid()` quando `auth.role() = 'service_role'`
  **e** `settings.autopilot.enabled = true` — a única exceção ao "só um humano publica",
  e só nesse par de condições.

## Storage

- Bucket `media` (público) — imagens de capa dos artigos.
