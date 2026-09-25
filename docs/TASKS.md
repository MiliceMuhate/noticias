# TASKS — Plano de construção

Trabalha por fases, por ordem. Não avances de fase sem a anterior a funcionar de ponta
a ponta. Marca `[x]` quando concluído. Cada tarefa deve terminar com algo executável e
testável. Respeita sempre os guardrails do `CLAUDE.md`.

Âmbito: só futebol, só artigo, só publicação no próprio site (ver `docs/PRD.md`).

## Fase 0 — Fundações

- [x] Inicializar monorepo (pnpm workspaces): `apps/web`, `supabase/`, `packages/shared`.
- [x] `supabase init`; configurar ambiente local (`supabase start`).
- [x] Criar migração inicial com os enums e tabelas de `DATA_MODEL.md`.
- [x] Ativar RLS e escrever as políticas descritas no `DATA_MODEL.md`.
- [x] Criar bucket de Storage `media`.
- [x] `supabase gen types typescript` → `packages/shared/db.ts`.
- [x] `.env.example` com todas as variáveis (sem valores reais).

## Fase 1 — Backend FastAPI + deteção e pontuação

- [x] `apps/api`: estrutura FastAPI (`app/main.py`, `app/config.py`, `app/db.py`).
- [x] `RssNewsSource` (`app/services/news_sources.py`) — único provider, feeds RSS
      configurados (nunca pesquisa aberta na internet).
- [x] `sync_trends` no scheduler interno (`app/scheduler.py`): descobre artigos +
      pontua (`app/services/scoring.py`), num único ciclo periódico.
- [ ] Teste: um artigo real de futebol de uma fonte configurada aparece em `topics`
      com score, sem intervenção manual, ao correr `uvicorn app.main:app`.

## Fase 2 — Geração de artigo (reescrita de notícia real)

- [x] `fetch_source_article` (`app/services/source_article.py`) — extrai texto e
      imagem principal do artigo real via `trafilatura`.
- [x] `generate_pending` no scheduler: `topics` em `approved_for_gen` → artigo real →
      cadeia Claude. Grava `metadata.source_name`/`source_url` diretamente (não pelo
      LLM). Atribui `author`. Cria `content_items` com `status='pending_review'`.
- [x] **Superado por `docs/publicador/` (ver Fase 5 abaixo):** a cadeia de 2 passos
      original (reescrita+metadados, que via o texto da fonte) foi substituída pela
      cadeia de 6 passos onde `write_article` nunca vê a fonte, mais o portão de
      originalidade determinístico.
- [ ] Teste: um topic aprovado para geração produz um rascunho em revisão, sem publicar nada.

## Fase 5 — Motor editorial e portão de originalidade

Especificação completa em `docs/publicador/` (`TASKS_CONTENT.md`, `PROMPTS.md`,
`EDITORIAL.md`, `ORIGINALITY.md`, `AUTHORS.md`). Implementado (5.1–5.6):

- [x] 5.1 Ficha de factos — `app/services/facts.py` (P1), porta de qualidade.
- [x] 5.2 Briefing editorial — `app/services/brief.py` (P2), `settings.authors`
      com as 4 editorias de `AUTHORS.md`, `settings.editorial_voice`.
- [x] 5.3 Redação sem o original — `write_article` em `app/services/articles.py`
      (P3), garantido pela assinatura da função + testado em
      `tests/test_write_article_never_sees_source.py`.
- [x] 5.4 Portão de originalidade — `app/services/originality.py` (transcrito de
      `ORIGINALITY.md` §3), `tests/test_originality.py` (os 8 casos obrigatórios).
- [x] 5.5 Empacotamento — `package` (P4); limites de ritmo em `enforce_review_gate`
      (só `max_published_per_day` — ver nota; existiu também
      `min_minutes_between_publications`, removido a pedido do operador).
- [x] 5.6 Painel — distintivo de originalidade, lista "frases a verificar" (versão
      simplificada da vista lado-a-lado — ver `docs/ARCHITECTURE.md`), seletor de
      título, checklist de `EDITORIAL.md` §8.
- [ ] **Por fazer** (fora desta passagem, ver `docs/publicador/TASKS_CONTENT.md`
      "A perguntar depois"): 5.7 páginas públicas (`/sobre` etc. — precisam do nome
      real do operador), `max_per_source_per_day` e `require_manual_edit_every_n` ao
      nível da BD, `scripts/calibrate_originality.py` corrido a sério com dados reais.

## Fase 3 — Dashboard e portão de aprovação

- [x] `apps/web`: Vite + React + TS + Tailwind + `@supabase/supabase-js` + TanStack Query.
- [x] Auth (login do operador) e proteção de rotas, agora em `/admin/*`.
- [x] Vista **Fila de revisão**: cartão com título, corpo (renderizado), link ao
      artigo original (para verificar fidelidade da reescrita) e botões
      Aprovar/Rejeitar/Editar.
- [x] Aprovar → `status='published'` — o trigger `enforce_review_gate` impõe que só um
      humano autenticado o faça, e só a partir de `pending_review`.
- [x] Realtime: a fila atualiza ao vivo quando entram peças novas.
- [x] Vista **Tendências**: lista com score/momentum/estado.
- [ ] Confirmar (teste explícito): não existe nenhum caminho que publique sem aprovação.

## Fase 4 — Publicação no site

- [x] Trigger `publish_content_item`: ao aprovar, calcula slug único, define
      `published_at`/`published_url` e regista `audit_log` — tudo na própria transação,
      sem passo assíncrono nem canal externo.
- [x] View pública `published_articles` (só colunas seguras) + `grant select` a `anon`.
- [x] `apps/web`: páginas públicas `NewsList` (`/`) e `ArticlePage` (`/artigo/:slug`),
      sem login.
- [ ] Teste ponta-a-ponta: artigo real detetado → rascunho reescrito → aprovação →
      artigo visível em `/artigo/:slug`, com atribuição, sem sessão.

## Fase 6 — Piloto automático (publicação sem clique por artigo)

`supabase/migrations/20260922000001_autopilot.sql`, `apps/api/app/scheduler.py`
(`autopilot_tick`, `auto_publish_ready`), `apps/web/src/pages/Automacao.tsx`.

- [x] Interruptor `settings.autopilot.enabled` — ligar/desligar é um `update`
      autenticado (RLS `is_operator()`), a decisão humana passa a ser por lote,
      não por artigo (ver nota de guardrail abaixo).
- [x] `enforce_review_gate` ganha uma exceção estreita: publica sem `auth.uid()`
      humano só quando `auth.role() = 'service_role'` (só o backend tem esta
      chave) **e** o interruptor está ligado. O caminho manual do dashboard fica
      inalterado.
- [x] `auto_publish_ready()` só publica sozinho peças com originalidade `pass` e
      auditoria `aprovado` — `review`/`block` ficam sempre para um humano.
- [x] `max_per_source_per_day` e `require_manual_edit_every_n` (adiados na Fase 5)
      ficam aplicados aqui, do lado do piloto automático — o primeiro por
      contagem, o segundo reservando 1 em cada N para revisão manual.
- [x] Painel **Piloto automático**: liga/desliga, contadores ao vivo, lista
      "Precisa de ação humana" (falhas de geração + peças com `verdict≠pass`).
- [ ] Por fazer: `max_per_source_per_day`/`require_manual_edit_every_n` continuam
      sem equivalente ao nível da BD — só o piloto automático os respeita; uma
      aprovação manual avulsa no dashboard não é limitada por eles.

## Fase 7 — Multi-língua, provedores de IA e política editorial no painel

`supabase/migrations/20260925000001_i18n_ai_providers_policy.sql`,
`apps/api/app/llm.py`, `apps/api/app/services/translate.py`,
`apps/web/src/lib/i18n.ts`, `apps/web/server.js`, `apps/web/src/pages/config/`.

- [x] **Site em pt/en/es/fr.** pt na raiz (URLs já indexados não mudam), outras
      línguas com prefixo. `published_articles` passa a ter uma linha por
      (artigo, língua), com `lang` e `alternates` → `hreflang` no `<head>` e no
      `sitemap.xml`, `<html lang>`, `og:locale`, `inLanguage`.
- [x] Deteção automática em `server.js`: país (`CF-IPCountry` e afins) → língua;
      sem país, `Accept-Language`; crawlers nunca são redirecionados. O seletor no
      cabeçalho grava o cookie `lang`, que passa à frente da deteção. Um slug de
      outra língua (ex.: pt aberto com `/en/`) responde 301 para a versão certa.
- [x] Traduções geradas pelo backend (`translate_published`, 2 min) a partir do pt
      **publicado**; cada tradução passa pelo portão de originalidade contra a
      fonte (mesma língua → comparação significativa) e só fica `ready` se não
      bloquear. Edições ao pt refazem as traduções (`source_hash`).
- [x] **Provedores de IA configuráveis** sem mexer no código: tipo `anthropic` ou
      `openai_compatible`, URL, cabeçalhos, modelos e preços em
      `settings.ai_providers`; chave no Vault (`set_ai_provider_key`, só
      operadores escrevem, só `service_role` lê). Provedor e modelo por passo em
      `model_by_step` (formato antigo, só o nome do modelo, continua a funcionar).
      Custo por chamada com o preço do modelo usado (antes assumia um modelo único).
- [x] **Política editorial no painel** (Configuração): o que o piloto publica
      sozinho (`autopilot_policy` — ver guardrail #1 no CLAUDE.md), rigor da
      auditoria e reescrita também em `rever` (`editorial_pipeline`), limiares de
      originalidade, pontuação, voz/autoria/tags, línguas das traduções.
- [x] Fila de revisão mostra o veredicto e os achados da auditoria; o distintivo
      determinístico passa a dizer "Sem cópia literal" (não "Original").
- [x] Citações: a ficha de factos guarda também a tradução pt (`traducao`); o
      artigo usa-a e o portão aceita-a como citação autorizada.
- [ ] Por fazer: categorias (`topics.category`) não são traduzidas; o painel
      /admin fica só em português; não há botão "testar ligação" por provedor.
      As rotas `/admin/*` da API não verificam quem as chama — hoje só são
      acessíveis dentro da VPS (`127.0.0.1:8000`, ver `deploy/docker-compose.yml`);
      antes de expor a API ao browser, exigir o JWT do Supabase de um operador.

## Definição de "concluído" (qualquer fase)

- Corre localmente com `supabase start` + `apps/api` (uvicorn) + `apps/web`.
- RLS respeitado; nenhum segredo no repositório.
- Nenhum caminho publica sem aprovação humana **ou sem o piloto automático
  ligado por um humano** — ver Fase 6. Fora do piloto automático, a regra
  original mantém-se: sem aprovação humana registada, nada publica.
- Migrações versionadas e tipos regenerados.
