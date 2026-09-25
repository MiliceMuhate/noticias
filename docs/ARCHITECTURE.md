# ARCHITECTURE — Máquina de Conteúdo

## Visão geral

Dois serviços: **Supabase** (dados + auth) e **FastAPI** (toda a lógica de aplicação,
incluindo o seu próprio scheduler). Sem filas nem Edge Functions — um único processo
Python já não precisa de handoff entre processos.

```
[apps/api scheduler]
  a cada N min → discover_articles (RSS das fontes ativas) → [topics: detected]
              → score_topics  → [topics: scored | approved_for_gen]
  a cada M min → generate_pending (topics em approved_for_gen)
              → fetch_source_article(link) → texto real → grava sport_facts
              → cadeia de 6 passos (docs/publicador/PROMPTS.md):
                P1 extract_facts (porta: sem substância → rejected)
                → P2 editorial_brief (porta: inviável → rejected)
                → P3 write_article (NUNCA vê a prosa da fonte, só a ficha)
                → portão de originalidade determinístico (originality.py)
                → P5 self_audit → (block? P6 rewrite_flagged → verifica outra vez)
                → P4 package
              → [content_items: pending_review]
                (metadata.source_name/source_url gravados diretamente, não pelo LLM)
                                     ↓ Realtime
                              [Dashboard /admin — apps/web]
                                     ↓ APROVAÇÃO HUMANA (com link à fonte para verificar)
                              trigger na BD: publish_content_item()
                                     ↓ status='published' + published_url
                              [Site público / — apps/web, sempre com "Fonte: ..."]
```

## Componentes

### 1. Supabase (dados + auth, nada mais)

- **Postgres** — fonte de verdade de todo o estado. Ver `DATA_MODEL.md`.
- **Auth** — login do operador no painel `/admin`.
- **Storage** — bucket `media` (imagem de capa dos artigos).
- **Realtime** — o painel subscreve `topics` e `content_items` para atualização ao vivo.
- **Triggers na BD** (não a app) impõem o portão de aprovação (`enforce_review_gate`) e
  calculam o slug/URL ao publicar (`publish_content_item`) — ver `DATA_MODEL.md`. Desde
  a Fase 6, `enforce_review_gate` tem uma exceção estreita ao "só um humano publica":
  com `settings.autopilot.enabled=true` **e** a chamada a vir da `service_role` key (só
  o backend a tem), aceita publicar sem `auth.uid()` — ver "Piloto automático" abaixo.

Sem Edge Functions, sem Cron do Supabase, sem Queues (pgmq): essa responsabilidade
passou toda para o `apps/api`.

### 2. Backend — `apps/api` (FastAPI/Python, serviço único)

Autentica-se com a `service_role` key (só existe aqui — guardrail #4). Corre um
scheduler interno (APScheduler, arrancado no `lifespan` da app — ver `app/main.py`):

- **`sync_trends`** (10 min por omissão): para cada `sources` ativa (feeds RSS),
  `RssNewsSource.discover()` → upsert `topics` (`app/services/news_sources.py`,
  `raw_data` inclui sempre o `link` do artigo original); depois pontua os `topics` em
  `detected` (`app/services/scoring.py`) — mesma fórmula de sempre:
  `score = relevance*w1 + momentum*w2 + volume*w3` (pesos em `settings.scoring_weights`;
  itens de RSS não têm volume/momentum reais, por isso caem nos valores neutros já
  previstos na fórmula).
- **`generate_pending`** (2 min por omissão): para cada `topic` em `approved_for_gen`
  reclama-o com um `update ... where status='approved_for_gen'` (compare-and-swap —
  não um `update` incondicional; corre ao mesmo tempo que `autopilot_tick`, que chama
  a mesma função, por isso tem de ser seguro contra duas chamadas concorrentes
  reclamarem o mesmo topic) → `fetch_source_article(link)`
  (`app/services/source_article.py`, extrai o texto principal da página real com
  `trafilatura`) → grava `sport_facts` (o artigo-fonte, não estatísticas) → orquestra a
  cadeia de 6 passos de `docs/publicador/PROMPTS.md` (`app/services/articles.py`
  chama `facts.py`, `brief.py`, `self_audit.py`; `originality.py` é o portão
  determinístico entre eles) → cria `content_items` em `pending_review`, com
  `metadata.source_name`/`source_url` gravados diretamente a partir do artigo
  extraído (não confiados ao LLM). Ver "Motor editorial" abaixo para o detalhe da
  cadeia. Dois desfechos que **não** contam para `MAX_GENERATE_ATTEMPTS` (não são
  falhas técnicas, são o sistema a decidir que o assunto não dá artigo — exceção
  `TopicRejected`): P1 sem substância, P2 inviável — vão direto a `topics.status='rejected'`.
  Falhas técnicas genuínas devolvem o topic a `approved_for_gen` até
  `MAX_GENERATE_ATTEMPTS` (contados em `jobs`).
- `POST /admin/detect-now` e `POST /admin/generate-now` disparam os dois ciclos fora do
  intervalo normal (gatilho manual, ex.: botão no painel).
- **`autopilot_tick`** (20s por omissão, sempre agendado mas quase sempre um no-op): só
  faz algo se `settings.autopilot.enabled=true`. Quando ligado, cada ciclo corre
  `sync_trends` → `generate_pending` (lote maior, 25) → `auto_publish_ready` — deteta,
  gera e **publica sozinho**, sem esperar por um clique por artigo. `generate_pending`
  recebe `auto_publish_ready` como `after_each`: cada peça fica disponível para
  publicação logo que ELA PRÓPRIA termina de gerar, não só no fim do lote inteiro —
  com lotes de 25 topics a 6 chamadas de LLM cada, esperar pelo lote todo podia levar
  dezenas de minutos até a primeira peça pronta chegar a publicar. `auto_publish_ready`
  só publica `content_items` com `metadata.originality.verdict='pass'` **e**
  (sem auditoria, ou `self_audit.veredicto='aprovado'`) — qualquer coisa marcada
  `review` fica sempre em `pending_review`, para um humano ver em `/admin/automacao`.
  Aplica também, do lado da app (sem equivalente na BD), `max_per_source_per_day` e
  `require_manual_edit_every_n` de `settings.publishing_limits`.

Não há `Publisher` nem rota de publicação: publicar é o trigger da BD (secção seguinte),
disparado pela escrita do operador via `supabase-js` (aprovação manual) ou pelo próprio
backend via `service_role` (piloto automático ligado).

### 3. Frontend — `apps/web` (React + Vite, dashboard **e** site público)

- **Site público** (`/`, `/artigo/:slug`, sem login): lê a view `published_articles`
  (só colunas seguras) com a chave `anon`. **Renderizado no servidor (SSR)** para o
  Google indexar o HTML completo: `apps/web/server.js` (Express; Vite em middleware
  mode em dev) chama `src/entry-server.tsx`, que pré-carrega os dados com as mesmas
  query keys das páginas (`src/lib/publicData.ts`), faz `renderToString` e monta o
  `<head>` (title, description, canonical, Open Graph, JSON-LD `NewsArticle` com
  `isBasedOn` → fonte — `src/lib/seo.ts`). O estado do TanStack Query segue em
  `window.__RQ_STATE__` e `src/entry-client.tsx` hidrata sem novo pedido. Também
  serve `/sitemap.xml` e `/robots.txt`. Respostas: 404 para artigo/rota inexistente;
  `noindex` em pesquisas, categorias com <3 artigos e `/admin`. Se o Supabase falhar
  durante o SSR, cai para a SPA vazia (o browser renderiza sozinho). Domínio
  canónico: env `SITE_URL` (produção: `https://footballtrend.online`). Tudo o que só
  o browser sabe (fuso horário, "há 5 min", consentimento de cookies) só aparece
  depois de hidratar — `useHydrated()` em `src/lib/hydration.ts` — para o HTML do
  servidor e o do cliente não divergirem.
- **Painel `/admin/*`** não é renderizado no servidor (depende da sessão, que só
  existe no browser): o servidor devolve o `#root` vazio com `noindex` e o cliente
  faz render normal.
- **Painel `/admin/*`** (com login): fila de revisão (cartão com o artigo, o link ao
  artigo original — para o operador confirmar a fidelidade da reescrita — e o texto
  extraído em `sport_facts`, e botões Aprovar/Rejeitar/Editar), vista de tendências,
  vista **Piloto automático** (`Automacao.tsx` — liga/desliga, contadores ao vivo, lista
  "precisa de ação humana"), configuração de fontes RSS. Estado ao vivo via Supabase
  Realtime; dados via TanStack Query.
- "Aprovar" faz um único `update(content_items).set(status='published')` — o trigger na
  BD trata do resto (slug, `published_url`, `audit_log`). Ligar o piloto automático é o
  mesmo tipo de escrita, mas em `settings.autopilot` — o `update` em si já exige um
  operador autenticado (RLS); depois disso é o backend, não o operador, que publica.

## Abstrações-chave (`apps/api`)

- **`NewsSource` (Protocol):** `discover(config) -> list[DiscoveredArticle]`. Única
  implementação: `RssNewsSource` (`app/services/news_sources.py`) — feeds RSS, sem
  chave de API. Deliberadamente só fontes configuradas: nada de pesquisa aberta.
- **`fetch_source_article(url) -> SourceArticle`** (`app/services/source_article.py`):
  extrai título/texto/nome do site/imagem de uma página real com `trafilatura`. Lança
  erro em vez de inventar se não conseguir — `mock_source_article` só em dev
  (`ALLOW_MOCK_FACTS=true`), claramente marcado como fictício.

## Motor editorial (`docs/publicador/`)

A ideia central: **quem escreve o artigo (P3) nunca vê a prosa do artigo original** —
só uma ficha de factos telegráfica (P1). É a mudança estrutural que torna o plágio
improvável em vez de só proibido por instrução (`docs/publicador/PROMPTS.md` §0).

| Passo | Módulo | Vê o texto original? | Porta |
|---|---|---|---|
| P1 `extract_facts` | `app/services/facts.py` | sim (é o único trabalho dele) | `len(factos)<4` ou `densidade='baixa'` → `TopicRejected` |
| P2 `editorial_brief` | `app/services/brief.py` | não (só a ficha) | `viavel=false` → `TopicRejected` |
| P3 `write_article` | `app/services/articles.py` | **não, nunca** — garantido pela assinatura da função, não só pelo prompt (testado em `tests/test_write_article_never_sees_source.py`) | — |
| — `originality.check` | `app/services/originality.py` | compara com o original, mas é determinístico (regex + shingles, sem LLM, grátis) | `block` → P6 |
| P5 `self_audit` | `app/services/self_audit.py` | sim (o trabalho é comparar) | `veredicto='bloquear'` → P6 |
| P6 `rewrite_flagged` | `app/services/self_audit.py` | não (só os trechos assinalados) | ainda `block` depois → `GenerationError`, `topic='failed'` |
| P4 `package` | `app/services/articles.py` | não | — |

`app/services/entities.py` constrói o conjunto de exceções (nomes próprios da ficha +
expressões fixas do domínio) que o portão de originalidade ignora — sem isto,
`longest_common_run` dispararia em qualquer menção a "Liga dos Campeões da UEFA".

**Nota de calibração (2026-09-24):** durante as primeiras semanas, `self_audit`
devolveu `veredicto='rever'` em 100% dos artigos, mesmo os que já tinham passado
`originality.check` com `verdict='pass'` — o piloto automático nunca publicava
nada sozinho, tudo exigia aprovação manual a sobrepor o aviso. Causa: o prompt
pedia "8+ palavras iguais" para COPIADO sem ter em conta que a fonte está sempre
em inglês e o artigo em português (o modelo "encontrava" correspondências que não
existiam), e tratava qualquer frase de INVENTADO fora da ficha como violação,
incluindo o comentário analítico que `write_article`'s LEI 5 pede explicitamente
nas secções "Porque importa"/"O que vem a seguir". Corrigido em
`app/prompts/self_audit.system.md`/`.user.md` — critérios adaptados à tradução
cross-língua, comentário de contexto explicitamente isento, e calibração
explícita do veredicto ("aprovado" é o resultado esperado, não a exceção).

Prompts vivem em `app/prompts/*.md` (nunca em f-strings no código Python — ver
`app/prompts.py`), um ficheiro por passo/papel. Cada passo pode usar um modelo
diferente via `settings.model_by_step` (lido da BD, `app/settings_store.py`) — hoje
todos apontam ao mesmo modelo do `.env`, por decisão explícita (a workspace AWS não
tem acesso confirmado a outros modelos além de `claude-haiku-4-5`).

`content_items.author` é um objeto estruturado (`{byline, desk, editor, ai_assisted}`,
`docs/publicador/AUTHORS.md` §1) — autoria transparente, nunca uma pessoa fictícia.
`desk` deriva de `facts.tipo` (`DESK_BY_TIPO` em `articles.py`) e escolhe a voz/beat
usados em P2/P3.

## Fluxo detalhado (notícia real → artigo publicado)

1. `sync_trends` (na verdade `discover_articles` + `score_detected_topics`) lê as
   fontes RSS ativas e grava `topics` novos (`status='detected'`), um por artigo
   descoberto — `term` é o título, `raw_data.link` é o URL do artigo original.
2. Na mesma passagem, pontua os `topics` em `detected`; abaixo do limiar → `rejected`,
   acima → `scored`, e se `settings.auto_approve_gen` permitir → `approved_for_gen`.
3. `generate_pending` apanha `topics` em `approved_for_gen`, vai buscar o texto real do
   artigo (`fetch_source_article`), corre a cadeia de 6 passos ("Motor editorial"
   acima) e cria `content_items` (`status='pending_review'`) com a atribuição, o
   relatório de originalidade e o `trace` já gravados em `metadata`.
4. Realtime empurra a peça para a fila de revisão do painel, com o link ao artigo
   original, o distintivo de originalidade (🟢/🟡) e a checklist de
   `docs/publicador/EDITORIAL.md` §8 bem visíveis.
5. Operador aprova (`status='published'`) ou rejeita (`status='rejected'`) — só um
   utilizador autenticado pode, só a partir de `pending_review`, e só dentro de
   `settings.publishing_limits` (`enforce_review_gate`, imposto na BD).
6. Ao aprovar, o trigger `publish_content_item` calcula um slug único, define
   `published_at`/`published_url` e regista `audit_log` (`action='approve'`) — tudo numa
   transação, sem passo assíncrono.
7. O site público lê `published_articles` e mostra o artigo em `/artigo/:slug`, sempre
   com o bloco "Fonte: ... — ver artigo original" (`source_name`/`source_url` da view).

## Ambientes e segredos

- Local: `supabase start` + `.env` (`apps/api`) + `.env.local` (`apps/web`).
- Produção: variáveis no host do `apps/api`; segredos sensíveis no **Supabase Vault**
  quando fizer sentido (ex.: se algum dia se acrescentar outra API externa).
- O frontend só conhece `SUPABASE_URL` e `SUPABASE_ANON_KEY`. Nunca a `service_role`.
