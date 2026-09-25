# TASKS — Fase 5: motor editorial e portão de originalidade

> Continuação do `TASKS.md`. Mesma disciplina: por ordem, nada avança sem a anterior a
> funcionar de ponta a ponta, cada tarefa acaba em algo executável e testável.
>
> **Não começar esta fase antes de fechar os testes em aberto das fases 1–4.** Um
> motor editorial sofisticado em cima de um pipeline não testado é tempo mal gasto.

---

## 5.1 — Ficha de factos (a mudança estrutural)

- [ ] `app/services/facts.py`: `extract_facts(source_article) -> FactSheet` — prompt P1
      de `docs/PROMPTS.md`, saída JSON validada com Pydantic.
- [ ] Gravar a ficha em `sport_facts.data.facts` (o `jsonb` já existe; passa a ser
      `{title, text, facts}`).
- [ ] Porta de qualidade: `len(factos) < 4` ou `densidade == "baixa"` → topic para
      `rejected`, motivo em `jobs.error`.
- [ ] Reaproveitamento: se a ficha já existir para o topic, nova tentativa não repete P1.
- [ ] Teste: uma notícia real de futebol produz ≥ 6 factos e nenhuma `nota` com mais de
      25 palavras.

## 5.2 — Briefing editorial

- [ ] `settings` ganha as chaves `editorial_voice`, `publishing_limits`,
      `originality_thresholds`, `model_by_step`, `controlled_tags`; `authors` passa a
      ter as quatro secções de `docs/AUTHORS.md`.
- [ ] `app/services/brief.py`: prompt P2, recebe ficha + últimos 10 títulos + variações
      recentes do desk.
- [ ] Vocabulário fechado de `variation` (7 valores) — validado, não texto livre.
- [ ] `viavel: false` → topic para `rejected` com motivo visível no painel.
- [ ] Teste: dois topics do mesmo dia sobre assuntos diferentes recebem variações diferentes.

## 5.3 — Redação sem o original

- [ ] Reescrever `app/services/articles.py`: P3 recebe **apenas** ficha + briefing +
      manual editorial + persona. Garantir por teste que `source_text` não entra no
      contexto desta chamada.
- [ ] Validar estrutura obrigatória (`EDITORIAL.md` §3) antes de qualquer outra coisa.
- [ ] Gravar `trace` e `afirmacoes_de_contexto` em `content_items.metadata`.
- [ ] Teste: o corpo tem as três secções obrigatórias, 650–900 palavras, e cada
      parágrafo factual tem pelo menos um `fact_id` no `trace`.

## 5.4 — Portão de originalidade

- [ ] `app/services/originality.py` — código de `docs/ORIGINALITY.md` §3.
- [ ] `apps/api/tests/test_originality.py` — os 8 casos de `docs/ORIGINALITY.md` §4.
- [ ] Integrar em `generate_pending` na ordem certa: gate determinístico **antes** do
      `self_audit`.
- [ ] P5 `self_audit` + P6 `rewrite_flagged` (uma tentativa, depois `failed`).
- [ ] Gravar o relatório em `content_items.metadata.originality`.
- [ ] Verificação: colar o texto da fonte como corpo produz `block` e nenhum
      `content_item` é criado.

## 5.5 — Empacotamento

- [ ] P4 `package`: título + 2 alternativas, dek, `seo_description`, tags do vocabulário
      controlado, slug.
- [ ] Rejeitar tags fora do vocabulário (não criar categorias novas por artigo).
- [ ] `title_overlap` com o título da fonte verificado aqui, não só no gate.

## 5.6 — Painel: revisão que se faz em segundos

- [ ] Distintivo de originalidade no cartão (🟢 / 🟡 com motivos).
- [ ] Vista lado-a-lado: frases assinaladas realçadas no corpo, com o trecho
      correspondente da fonte ao lado. **É esta tarefa que decide se a revisão humana
      é real ou decorativa** — sem ela, ninguém compara dois artigos ao décimo do dia.
- [ ] Painel `trace`: mostrar as `afirmacoes_de_contexto` numa lista para verificação rápida.
- [ ] Troca de título com um clique, a partir das alternativas.
- [ ] Checklist de `EDITORIAL.md` §8 visível (colapsada por omissão).
- [ ] Limites de ritmo: bloquear o botão Aprovar quando `max_published_per_day` ou
      `min_minutes_between_publications` forem excedidos, com explicação.
- [ ] `require_manual_edit_every_n`: a cada 5 artigos, Aprovar fica indisponível até
      passar por Editar.

## 5.7 — Site público

- [ ] Bloco de autoria com divulgação de IA + editor responsável (`docs/AUTHORS.md` §1).
- [ ] Páginas `/sobre`, `/contacto`, `/politica-editorial`, `/politica-de-privacidade`,
      `/correcoes`.
- [ ] Páginas de secção `/seccao/:desk`.
- [ ] Nota de atualização no fim dos artigos editados (a partir de `audit_log`).
- [x] `sitemap.xml`, `robots.txt`, `noindex` em páginas de arquivo finas.
- [x] Dados estruturados `NewsArticle` (JSON-LD) com `author`, `publisher`, `datePublished`,
      `dateModified` e `isBasedOn` a apontar para a fonte.

## 5.8 — Antes de candidatar ao AdSense

- [ ] Correr a lista de `docs/ORIGINALITY.md` §5, ponto a ponto.
- [ ] Calibrar os limiares com os primeiros 20 artigos: comparar veredicto automático
      com leitura humana e ajustar.
- [ ] 25–30 artigos publicados, todos `pass`, todos com aprovação registada em `audit_log`.

---

# Prompts de implementação

Para colar num agente de código (Claude Code) com o repositório aberto. Um de cada
vez, por ordem — cada um assume o anterior concluído.

### Prompt 1 — Ficha de factos

```
Lê docs/PROMPTS.md (P1), docs/DATA_MODEL.md e app/services/source_article.py.

Implementa app/services/facts.py:
- modelos Pydantic FactSheet, Fact, Numero, Citacao, exatamente com o schema de P1
- extract_facts(article: SourceArticle) -> FactSheet, usando o system/user prompt de P1
  literalmente (carrega-os de app/prompts/, não os incorpores no código Python)
- parse_json_strict(): remove cercas de código, repara JSON truncado, levanta
  FactExtractionError se falhar
- validação pós-extração: rejeita qualquer nota com mais de 25 palavras, repete uma vez

Altera generate_pending para gravar a ficha em sport_facts.data.facts e para enviar o
topic para 'rejected' quando len(factos) < 4 ou densidade == 'baixa', com o motivo em
jobs.error.

Não toques na cadeia de geração ainda. Testes com uma ficha de exemplo em fixtures.
```

### Prompt 2 — Cadeia de seis passos

```
Lê docs/PROMPTS.md por inteiro e docs/EDITORIAL.md §2–§5.

Reescreve app/services/articles.py como uma cadeia explícita de passos, cada um numa
função isolada e testável: editorial_brief, write_article, package. Os prompts vivem em
app/prompts/*.md e são carregados, nunca embutidos em f-strings gigantes.

REQUISITO CRÍTICO, que quero verificado por teste: a chamada de write_article NÃO pode
receber o texto original do artigo-fonte em lado nenhum do contexto. Escreve
test_write_article_never_sees_source que intercepta o payload enviado à API e falha se
encontrar qualquer sequência de 8 palavras do texto original.

Usa o modelo indicado em settings.model_by_step para cada passo. Acumula input_tokens,
output_tokens e cost_usd de TODOS os passos na mesma linha de jobs (soma, não
substituição). Marca o manual editorial e a lista de clichés com cache_control ephemeral.
```

### Prompt 3 — Portão de originalidade

```
Lê docs/ORIGINALITY.md.

Cria app/services/originality.py com o código da secção 3, tal como está (já foi
testado; se melhorares, mantém a API pública e os nomes do relatório).

Cria apps/api/tests/test_originality.py com os 8 casos da secção 4. Usa artigos reais
de fixtures, não texto lorem ipsum — o gate mede propriedades linguísticas e texto
falso dá números falsos.

Integra em generate_pending nesta ordem exata:
  write_article -> originality.check -> (se != block) self_audit -> (se block) rewrite_flagged
    -> check outra vez -> ainda block? topic='failed', nada criado.
Grava o relatório em content_items.metadata.originality. Lê os limiares de
settings.originality_thresholds com fallback para os valores do documento.
```

### Prompt 4 — Revisão lado-a-lado

```
Lê docs/ORIGINALITY.md §3 (secção "O que o painel mostra") e docs/EDITORIAL.md §8.

Em apps/web/src/pages/ReviewQueue.tsx:
- distintivo de originalidade a partir de metadata.originality
- quando o veredicto é 'review', painel de duas colunas: o nosso corpo com as frases
  de flagged_spans realçadas, e ao lado o texto de sport_facts.data.text com o trecho
  correspondente realçado e sincronizado no scroll
- lista de afirmacoes_de_contexto com caixas de verificação (estado local, só ajuda visual)
- seletor de título a partir de metadata.alternativas
- checklist de EDITORIAL.md §8, colapsada

O objetivo é revisão em menos de 60 segundos por artigo quando está tudo bem, e
comparação imediata quando não está. Mantém o Realtime e o TanStack Query como estão.
```

### Prompt 5 — Limites de ritmo

```
Lê docs/EDITORIAL.md §9.

Implementa settings.publishing_limits com verificação em dois sítios:
1. No frontend, para desativar o botão Aprovar com explicação legível.
2. Na base de dados, em enforce_review_gate — porque um limite só no cliente não é um
   limite. Conta publicações das últimas 24h e o timestamp da última.

Inclui require_manual_edit_every_n: a cada N aprovações consecutivas sem edição, a
próxima publicação exige uma ação 'edit' registada em audit_log para o mesmo
content_item. Migração versionada + testes pgTAP ou equivalente.
```

### Prompt 6 — Páginas de confiança

```
Lê docs/AUTHORS.md e docs/ORIGINALITY.md §5.

Em apps/web, cria as páginas públicas /sobre, /contacto, /politica-editorial,
/politica-de-privacidade, /correcoes e /seccao/:desk. Conteúdo real, não placeholder —
usa docs/AUTHORS.md §1 para a divulgação de IA e docs/PRD.md §5 para a política
editorial. Deixa marcadores TODO só onde forem mesmo dados pessoais do operador.

Acrescenta JSON-LD NewsArticle nos artigos, com isBasedOn a apontar para source_url, e
o bloco de autoria com o editor responsável. Gera sitemap.xml a partir de
published_articles e põe noindex nas páginas de arquivo com menos de 3 artigos.
```

### Prompt 7 — Calibração

```
Escreve scripts/calibrate_originality.py: corre originality.check sobre todos os
content_items existentes (usando o sport_facts correspondente) e imprime uma tabela com
as seis métricas por artigo, mais os percentis 50/75/90/95 de cada uma.

Serve para eu comparar o veredicto automático com a minha leitura e ajustar
settings.originality_thresholds com dados em vez de palpites. Não altera nada na base
de dados.
```

---

## Ordem de valor, se o tempo for curto

Se só houver tempo para três coisas, são estas, por esta ordem:

1. **5.1 + 5.3** — a ficha de factos e a redação sem o original. É aqui que o risco de
   AdSense desaparece de facto, em vez de ser mitigado por instruções ao modelo.
2. **5.4** — o gate. Transforma "espero que esteja diferente" em "sei que está, e sei
   quanto".
3. **5.6 (lado-a-lado)** — sem isto, a revisão humana degrada-se em duas semanas e o
   portão de aprovação torna-se um carimbo.

O resto melhora o produto. Estes três decidem se ele pode existir.
