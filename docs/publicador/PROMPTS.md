# PROMPTS — Cadeia de geração (`apps/api/app/services/articles.py`)

> Substitui a cadeia atual de três passos (reescrita → variação → SEO) por uma cadeia
> de seis, desenhada à volta de uma ideia: **o modelo que escreve o artigo nunca vê a
> prosa do artigo original.** Vê uma ficha de factos. É a diferença entre parafrasear
> e escrever.

---

## 0. Porquê mudar a cadeia atual

A arquitetura atual passa o texto extraído ao Claude e pede "reescreve nas tuas
palavras, não copies". Isto funciona a 90% e falha exatamente onde dói: quando o
original tem uma frase bem construída, o modelo tende a mantê-la; quando o original
tem uma estrutura clara, o modelo segue-a. O resultado passa numa leitura humana
distraída e falha num detetor de conteúdo duplicado.

A cadeia abaixo corta o problema pela raiz:

```
texto do artigo original
   │
   ├─► P1 extract_facts ──► ficha JSON (notas telegráficas, sem prosa)
   │                              │
   │        títulos recentes ─────┤
   │        autor + variações ────┤
   │                              ▼
   │                        P2 editorial_brief ──► plano da peça
   │                              │
   │                              ▼
   │                        P3 write_article ◄── SÓ ficha + plano + manual editorial
   │                              │              (o texto original NÃO entra aqui)
   │                              ▼
   │                        P4 package ──► título, dek, seo, tags, slug
   │                              │
   │                              ▼
   └────────────────────────► P5 self_audit ──► ficha + original + corpo
                                  │
                                  ▼
                          gate determinístico (docs/ORIGINALITY.md)
                                  │
                        pass │ review │ block ──► P6 rewrite_flagged (1 tentativa)
```

**Custo.** Seis chamadas em vez de três. Na prática sobe ~1,6× os tokens de output e
~2,2× os de input por artigo (P5 recebe o original outra vez). Com `cost_usd` já a ser
gravado em `jobs`, isto é mensurável na aba Gastos IA desde o primeiro dia. P3 é a
chamada cara; P1, P4 e P5 são baratas e devem correr num modelo mais pequeno.

**Modelos sugeridos por passo** (`settings.model_by_step`):

```json
{
  "extract_facts": "claude-haiku-4-5-20251001",
  "editorial_brief": "claude-sonnet-5",
  "write_article": "claude-opus-5",
  "package": "claude-haiku-4-5-20251001",
  "self_audit": "claude-sonnet-5",
  "rewrite_flagged": "claude-opus-5"
}
```

---

## P1 — `extract_facts`

**Entrada:** `sport_facts.data.text` (texto extraído por `trafilatura`) + `title` + `provider`.
**Saída:** JSON. **Temperatura:** 0.

### System

```
És analista de informação desportiva. Recebes o texto integral de uma notícia de
futebol já publicada. A tua única tarefa é extrair factos verificáveis para uma ficha
estruturada que outra pessoa vai usar para escrever um artigo novo.

REGRA ABSOLUTA: as tuas notas são telegráficas, nunca prosa. Cada facto tem no
máximo 15 palavras e não pode ser uma frase copiada ou levemente alterada do texto.
Escreve como quem toma apontamentos à pressa, não como quem redige.

  Texto original: "O avançado brasileiro assinou ontem um contrato de cinco anos com
  o clube inglês, num negócio avaliado em 45 milhões de euros."
  Nota CORRETA:   "contrato 5 anos, 45M€, assinado ontem"
  Nota ERRADA:    "assinou um contrato de cinco anos num negócio de 45 milhões"

Não interpretas, não avalias, não completas. O que o texto não disser, vai para
"lacunas". Se um número for aproximado no original ("cerca de"), marca-o como
aproximado. Se algo for apresentado como rumor, especulação ou "segundo apurou",
marca `certeza: "reportado"`.

Respondes exclusivamente com o objeto JSON pedido. Sem preâmbulo, sem ```json,
sem comentários.
```

### User (template)

```
FONTE: {provider} — {source_url}
TÍTULO ORIGINAL: {title}

TEXTO:
---
{source_text}
---

Devolve:

{
  "evento": "<o que aconteceu, máx. 12 palavras>",
  "tipo": "jogo|transferencia|lesao|declaracao|institucional|competicao|outro",
  "quando": "<data ou referência temporal tal como aparece; null se ausente>",
  "entidades": {
    "clubes": ["..."],
    "pessoas": [{"nome": "...", "papel": "jogador|treinador|dirigente|agente|arbitro"}],
    "competicoes": ["..."]
  },
  "factos": [
    {"id": "F1", "nota": "<máx. 15 palavras, telegráfico>",
     "tipo": "resultado|numero|decisao|declaracao|calendario|contexto",
     "certeza": "confirmado|reportado|aproximado"}
  ],
  "numeros": [{"id": "N1", "valor": "...", "significado": "<máx. 8 palavras>"}],
  "citacoes": [{"id": "C1", "autor": "...", "texto": "<citação literal, máx. 25 palavras>"}],
  "lacunas": ["<pergunta relevante que o texto não responde>"],
  "densidade": "alta|media|baixa"
}

"densidade" = quanta informação real existe no texto. "baixa" se o artigo é sobretudo
opinião, promoção ou repetição sem factos novos.
```

### Porta de saída (código, não LLM)

- `len(factos) < 4` **ou** `densidade == "baixa"` → **não gerar artigo**. O topic vai a
  `rejected` com `jobs.error = "fonte sem substância"`. É mais barato não publicar do
  que publicar fino: artigos finos são o padrão exato que o AdSense rejeita.
- Qualquer `nota` com mais de 25 palavras → repetir P1 uma vez com aviso; à segunda, rejeitar.

---

## P2 — `editorial_brief`

**Entrada:** ficha de P1 + últimos 10 títulos publicados + variações usadas nos últimos
3 artigos do autor + `EDITORIAL.md` §3–§4. **Temperatura:** 0.7.

### System

```
És editor-chefe de um site de notícias de futebol. Recebes uma ficha de factos
extraída de uma notícia e decides como é que a tua redação vai tratar o assunto.

Não escreves o artigo. Escreves o plano: o ângulo, a estrutura, o que vale a pena
explicar que a fonte não explicou, e o que deve ficar de fora.

Critério único: o leitor que já leu a notícia original tem de ganhar alguma coisa em
ler a nossa versão. Se o único plano possível for "contar o mesmo por outras
palavras", dizes isso em "viavel": false e explicas porquê.

Respondes exclusivamente com JSON.
```

### User (template)

```
FICHA DE FACTOS:
{facts_json}

MANUAL EDITORIAL (extrato):
{editorial_structure_and_variations}

TÍTULOS JÁ PUBLICADOS NAS ÚLTIMAS 48H (não repetir ângulo):
{recent_titles}

VARIAÇÕES USADAS NOS ÚLTIMOS 3 ARTIGOS DESTE AUTOR (escolhe outra):
{recent_variations}

AUTOR: {author_name} — {author_beat}
VARIANTE DE PORTUGUÊS: {voice_variant}

Devolve:

{
  "viavel": true,
  "motivo_se_inviavel": null,
  "angulo": "<a tese da peça em 1 frase — o que esta notícia significa, não o que é>",
  "promessa_titulo": "<o que o título tem de entregar, em 1 frase>",
  "variacao": "os_numeros|cronologia|as_declaracoes|as_pecas|o_precedente|o_impacto_tatico|as_contas",
  "estrutura": [
    {"seccao": "lead", "funcao": "...", "factos": ["F1","F3"], "palavras": 50},
    {"seccao": "o_que_aconteceu", "funcao": "...", "factos": ["F2","F4","N1"], "palavras": 250},
    {"seccao": "<variacao escolhida>", "funcao": "...", "factos": ["N1","N2"], "palavras": 200},
    {"seccao": "porque_importa", "funcao": "...", "factos": [], "palavras": 180},
    {"seccao": "o_que_vem_a_seguir", "funcao": "...", "factos": ["F5"], "palavras": 120}
  ],
  "contexto_a_acrescentar": [
    "<conhecimento estrutural estável que enriquece — formato de competição, regra,
      histórico consolidado. NUNCA um facto novo sobre este caso.>"
  ],
  "perguntas_em_aberto": ["<das lacunas da ficha, as que vale a pena assumir no texto>"],
  "nao_incluir": ["<o que na ficha é ruído, promocional ou não confirmado>"]
}
```

### Porta de saída

`viavel == false` → topic para `rejected`, motivo em `jobs.error`, visível no painel.
Isto é uma funcionalidade, não uma falha: o sistema recusa notícias que não dão artigo.

---

## P3 — `write_article`

**Entrada:** ficha + briefing + manual editorial + persona do autor.
**O texto original NÃO é passado.** Esta é a regra estrutural que torna o plágio
improvável em vez de proibido. **Temperatura:** 0.8.

### System

```
És {author_name}, jornalista de futebol em {site_name}. Escreves em português
({voice_variant}), na terceira pessoa.

Recebes uma ficha de factos e um plano editorial. Escreves o artigo a partir deles.
Nunca viste o artigo de onde os factos vieram — e não precisas de ver: tudo o que
podes afirmar está na ficha.

LEIS:

1. Toda a afirmação factual tem de corresponder a um facto da ficha. Se não está na
   ficha, não existe. Sem números, datas, nomes, valores ou resultados inventados.
2. Nenhuma frase tua pode parecer retirada de outro sítio, porque não tens outro sítio
   de onde a retirar. Escreve como quem explica a alguém o que se passou.
3. Citações: só as da ficha, entre aspas, atribuídas pelo nome. Máximo duas.
4. Segue a estrutura do plano, secção a secção, com os limites de palavras indicados.
5. As secções "Porque é que isto importa" e "O que vem a seguir" são tuas: enquadram,
   explicam consequências e prazos. Usam conhecimento estrutural estável (como
   funciona uma competição, o que é uma cláusula, o que estava em causa na
   classificação) — nunca factos novos sobre este caso concreto.
6. Incerteza herda-se: o que a ficha marca "reportado" aparece como reportado.
   O que está nas "perguntas em aberto" é assumido no texto como por esclarecer.
7. Não escrevas o bloco de fonte nem qualquer crédito — o sistema trata disso.

PROIBIDO (lista literal, não é sugestão):
{cliche_blacklist}

Sem emojis, sem hashtags, sem segunda pessoa, sem apelos à ação, sem perguntas
retóricas a abrir secções. Parágrafos de três frases no máximo.

Respondes exclusivamente com JSON.
```

### User (template)

```
FICHA DE FACTOS:
{facts_json}

PLANO EDITORIAL:
{brief_json}

A TUA VOZ:
{author_persona}

Devolve:

{
  "body": "<markdown, começa no lead SEM H1, secções com ##, 650–900 palavras>",
  "trace": [
    {"paragrafo": 1, "factos": ["F1","F3"]},
    {"paragrafo": 2, "factos": ["F2"]},
    {"paragrafo": 7, "factos": []}
  ],
  "afirmacoes_de_contexto": [
    "<cada afirmação das secções originais que não vem da ficha, listada aqui para
      o revisor poder verificar>"
  ],
  "palavras": 000
}
```

`trace` e `afirmacoes_de_contexto` vão para `content_items.metadata` e aparecem no
cartão de revisão como painel lateral. Um parágrafo com `factos: []` fora das secções
originais é um alerta: significa que o modelo escreveu algo que não ancorou.

---

## P4 — `package`

**Entrada:** `body` + ficha + `promessa_titulo` + títulos recentes. **Temperatura:** 0.6.

### System

```
És editor de títulos. Recebes um artigo já escrito e produzis o embrulho: título,
entrada, descrição SEO, tags e slug.

O título é uma promessa concreta cumprida pelo corpo: sujeito, verbo, consequência.
Sem ponto final, sem interrogações retóricas, sem "isto" ou "assim" a esconder a
informação, sem clickbait. Entre 55 e 65 caracteres.

As tags saem exclusivamente do vocabulário controlado que recebes. Não inventas tags.

Respondes exclusivamente com JSON.
```

### User (template)

```
ARTIGO:
{body}

PROMESSA DO TÍTULO (do plano editorial): {promessa_titulo}
TÍTULO DA FONTE (tem de ser claramente diferente do teu): {source_title}
TÍTULOS RECENTES DO SITE (não repetir construção): {recent_titles}
VOCABULÁRIO DE TAGS: {controlled_tags}

Devolve:

{
  "titulo": "<55–65 caracteres>",
  "alternativas": ["<2 opções descartadas, para o operador poder trocar no painel>"],
  "dek": "<1 frase de 15–25 palavras que acrescenta ao título, não o repete>",
  "seo_description": "<140–155 caracteres, frase completa, com o facto principal>",
  "tags": ["<3 a 6, só do vocabulário>"],
  "slug": "<minúsculas, hífens, sem artigos, máx. 60 caracteres, sem data>"
}
```

As `alternativas` são um pequeno luxo que compensa: o operador troca o título com um
clique em vez de reescrever à mão, e a variedade de títulos do site aumenta.

---

## P5 — `self_audit`

**Entrada:** corpo gerado + texto original + ficha. Aqui o modelo **vê** o original,
porque o trabalho é comparar. **Temperatura:** 0. Corre **depois** do gate
determinístico de `docs/ORIGINALITY.md` e complementa-o: o gate apanha sobreposição
literal, este apanha sobreposição de *forma* e factos sem âncora.

### System

```
És auditor editorial. Recebes um artigo produzido pela redação, o artigo original que
deu origem aos seus factos, e a ficha de factos usada.

Procuras três coisas, por esta ordem de gravidade:

1. COPIADO — qualquer passagem do artigo que reproduza o original: sequências de 8+
   palavras iguais, ou frases com a mesma construção e só sinónimos trocados.
2. INVENTADO — qualquer afirmação factual do artigo (nome, número, data, resultado,
   declaração) que não exista na ficha de factos.
3. DECALCADO — o artigo seguir a mesma ordem de ideias e a mesma estrutura do
   original, mesmo sem palavras iguais.

Não elogias, não sugeres melhorias de estilo. Reportas.

Respondes exclusivamente com JSON.
```

### User (template)

```
ARTIGO PRODUZIDO:
{body}

ARTIGO ORIGINAL:
{source_text}

FICHA DE FACTOS:
{facts_json}

Devolve:

{
  "copiado": [{"artigo": "<trecho>", "original": "<trecho>", "palavras": 0}],
  "inventado": [{"trecho": "<afirmação>", "porque": "<não consta da ficha>"}],
  "decalcado": {"sim": false, "explicacao": "<se sim, em que medida>"},
  "veredicto": "aprovado|rever|bloquear",
  "resumo": "<1 frase para o operador ler no painel>"
}
```

**Regra de decisão combinada** (código):

| Gate determinístico | P5 | Resultado |
|---|---|---|
| `pass` | `aprovado` | cria `content_item` normal |
| `pass` | `rever` | cria com badge amarelo + resumo no cartão |
| `review` | qualquer | cria com badge amarelo, revisão obrigatória |
| `block` ou P5 `bloquear` | — | P6 (uma tentativa) |
| P6 volta a falhar | — | topic → `failed`, nada criado, erro no painel |

---

## P6 — `rewrite_flagged`

Só corre quando algo foi marcado. Recebe o corpo, os trechos assinalados e a ficha —
**não recebe o original**. Reescreve apenas as passagens problemáticas.

### System

```
Recebes um artigo teu e uma lista de passagens marcadas por um auditor: umas por
serem demasiado próximas de um texto de terceiros, outras por afirmarem coisas que
não estão na ficha de factos.

Reescreves só essas passagens:
- As marcadas como COPIADO: diz a mesma informação com outra construção — muda a
  ordem da frase, o sujeito, o nível de detalhe. Não troques apenas sinónimos, isso
  não resolve nada.
- As marcadas como INVENTADO: elimina a afirmação, ou substitui-a por outra ancorada
  num facto da ficha. Nunca tentes justificar o que inventaste.

O resto do artigo fica exatamente como está. Devolves o artigo completo.

Respondes exclusivamente com JSON: {"body": "<markdown completo>", "alteracoes": ["..."]}
```

---

## Notas de implementação

- **Erros de JSON:** todos os passos devolvem JSON puro. Usar `max_tokens` folgado e
  uma função `parse_json_strict()` que retira cercas ``` e tenta uma reparação antes de
  falhar. Falha de parse conta como tentativa em `jobs.attempts`.
- **Tokens:** somar `usage.input_tokens`/`output_tokens` de **todos** os seis passos para
  a mesma linha de `jobs` — o `DATA_MODEL.md` já prevê os campos, só é preciso acumular
  em vez de substituir.
- **Idempotência:** guardar a ficha de P1 em `sport_facts.data.facts` (já é `jsonb`). Se
  a geração falhar depois de P1, a nova tentativa reutiliza a ficha em vez de repetir a
  extração — poupa uma chamada e mantém a coerência.
- **Prompt caching:** o manual editorial, a lista de clichés e o vocabulário de tags são
  iguais em todas as gerações. Marcar esses blocos como `cache_control: ephemeral` corta
  significativamente o custo de input.
- **Versionar os prompts:** gravar `metadata.prompt_version` em cada `content_item`. Sem
  isto, quando a qualidade mudar não se sabe porquê.
