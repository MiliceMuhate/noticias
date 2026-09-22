# EDITORIAL — Manual de Estilo da Máquina de Conteúdo

> Documento normativo. O `apps/api` carrega-o como contexto dos prompts (ver
> `docs/PROMPTS.md`) e o operador usa-o como grelha de revisão no painel `/admin`.
> Alterar este ficheiro **é** alterar o produto editorial: versionar em commit próprio.

---

## 1. O que estamos a publicar (e o que não estamos)

Não somos um agregador. Um agregador copia e cita. Nós fazemos **jornalismo de
segunda mão explícito**: partimos de uma notícia real publicada por uma fonte
configurada, extraímos os **factos**, deitamos fora a prosa original, e escrevemos
uma peça nova que responde a mais perguntas do que a fonte respondia.

A diferença é operacional, não filosófica:

| Agregador (rejeitado pelo AdSense) | Nós |
|---|---|
| Parafraseia frase a frase | Reescreve a partir de uma ficha de factos, sem ver a prosa original |
| Mesma estrutura da fonte | Estrutura própria, fixada neste manual |
| Só o que a fonte disse | Factos da fonte **+ 3 blocos originais obrigatórios** |
| Crédito no fim, escondido | Atribuição visível, ligada, gravada de forma estruturada |
| 1 fonte = 1 artigo clonado | 1 fonte = 1 artigo que se lê sozinho, sem clicar no original |

**A regra que decide tudo:** se um leitor que já leu o artigo original não ganhar
nada em ler o nosso, o artigo não devia ter sido publicado.

---

## 2. Voz

Configurável em `settings` (chave `editorial_voice`), com estes valores por omissão:

```json
{
  "variant": "pt-PT",
  "person": "terceira",
  "register": "jornalístico informado, sem solenidade",
  "reader": "adepto que acompanha futebol mas não viu esta notícia",
  "sentence_target_words": 18,
  "paragraph_max_sentences": 3
}
```

**Como soa:**

- Direto. O facto vem primeiro, o floreado não vem de todo.
- Confiante sem ser categórico: se a fonte diz "deverá", nós dizemos "deverá".
- Concreto: nomes, números, datas. "Reforço caro" é preguiça; "20 milhões de euros" é informação.
- Sem torcida. Não temos clube. Descrevemos, não celebramos nem lamentamos.
- Sem segunda pessoa. Nada de "vais adorar saber que".

**Como não soa — lista de banimento (o prompt injeta-a literalmente):**

> numa reviravolta, vale a pena notar, não é segredo que, no mundo do futebol,
> sem sombra de dúvidas, deu que falar, fez história, o astro, o craque maior,
> eis o que sabemos, confira, saiba mais, fique atento, prepare-se, o cenário é
> claro, resta saber, uma coisa é certa, mexeu com as redes sociais, bombou,
> a internet não perdoou, um golo que vale mais do que três pontos.

**Ortografia e localização.** `variant` aceita `pt-PT` ou `pt-MZ`. A diferença não é
só ortográfica — é de referência: em `pt-MZ`, competições e clubes locais dispensam
explicação e as europeias levam contexto; em `pt-PT`, o inverso. Escolha uma e não
misture entre artigos: inconsistência de variante é um dos sinais mais visíveis de
conteúdo produzido em massa.

---

## 3. Estrutura obrigatória do artigo

Todo o artigo tem este esqueleto. O gerador não pode omitir blocos marcados
**[obrigatório]** — a validação em `apps/api` rejeita o rascunho se faltarem.

```
H1  Título                              [obrigatório]  55–65 caracteres
    Lead                                [obrigatório]  2–3 frases, 40–60 palavras
H2  O que aconteceu                     [obrigatório]  2–4 parágrafos
H2  [Bloco de detalhe variável]         [obrigatório]  ver §4 — varia por artigo
H2  Porque é que isto importa           [obrigatório]  ORIGINAL — não vem da fonte
H2  O que vem a seguir                  [obrigatório]  ORIGINAL — não vem da fonte
    Bloco de atribuição                 [sistema]      renderizado pelo apps/web
```

**Título.** Promessa concreta e verificável no corpo. Sujeito + verbo + consequência.
Sem clickbait ("o que aconteceu a seguir foi surpreendente"), sem ponto final, sem
interrogações retóricas. Nunca igual ao título da fonte — se a sobreposição de
palavras significativas for superior a 60%, reescrever (validado automaticamente).

- ✗ `Benfica vence e assume liderança` (é o título da fonte)
- ✓ `Benfica sobe à liderança com sete pontos de avanço sobre o rival`

**Lead.** Responde quem/o quê/quando em duas frases. Nunca começa com a mesma
palavra do lead da fonte. Nunca começa com data ("No passado domingo...").

**"O que aconteceu".** Só factos da ficha. Cada parágrafo um facto e a sua
consequência imediata. Parágrafos curtos: três frases é o teto.

**"Porque é que isto importa" [ORIGINAL].** Aqui é que o artigo deixa de ser uma
paráfrase. Enquadra: o que muda na classificação, no plantel, no calendário, no
equilíbrio da competição. Usa conhecimento estrutural estável (formato das
competições, regras, histórico consolidado) — **nunca** factos novos que a ficha não
tenha. Se não houver nada honesto a dizer, diz-se o que está em causa em termos
gerais, não se inventa.

**"O que vem a seguir" [ORIGINAL].** O próximo jogo, o próximo prazo, a próxima
decisão pendente, a pergunta que ficou por responder. Formulado como expectativa,
nunca como previsão disfarçada de facto.

---

## 4. Variação — o bloco de detalhe

O terceiro bloco (`H2` variável) é o mecanismo anti-monotonia. O gerador escolhe
**um** por artigo, e não pode repetir o mesmo que usou nos **três artigos anteriores**
do mesmo autor (lista passada ao prompt).

| Variação | Quando usar | Forma |
|---|---|---|
| `os_numeros` | Há estatísticas na ficha | Lista de 3–5 números com o que significam |
| `cronologia` | Processo arrastado (transferência, lesão, litígio) | Linha temporal datada |
| `as_declaracoes` | Há citações na ficha | Citação curta + o que ela revela |
| `as_pecas` | Envolve várias entidades | Quem é quem e o que cada um quer |
| `o_precedente` | Situação com paralelo conhecido | Caso anterior comparável, com a diferença |
| `o_impacto_tatico` | Notícia de jogo ou de treinador | O que muda em campo, sem inventar esquemas |
| `as_contas` | Valores, salários, cláusulas | O dinheiro explicado em partes |

A variação escolhida é gravada em `content_items.metadata.variation` — que já existe
no `DATA_MODEL.md`. Passa a ter um valor do vocabulário fechado acima, não texto livre.

---

## 5. Regras de facto (anti-invenção)

1. **Cada afirmação factual tem de existir na ficha de factos.** O gerador nunca vê a
   prosa original — vê notas telegráficas. Se não está na ficha, não vai para o artigo.
2. **Nenhum número sem origem.** Sem resultados, idades, valores ou datas que a ficha
   não contenha.
3. **Citações:** só as que vierem na ficha, entre aspas, atribuídas pelo nome, **máximo
   duas por artigo e 25 palavras cada**. Acima disso é reprodução, não citação.
4. **Nada de reações inventadas.** Sem "os adeptos reagiram", "as redes sociais
   incendiaram-se", sem opiniões atribuídas a coletivos.
5. **Incerteza herdada.** Se a fonte diz que é rumor, o artigo diz que é rumor. Marcar
   a origem quando for relevante: "segundo o jornal X".
6. **Lacunas assumidas.** O que a fonte não esclarece, dizemos que não está esclarecido.
   Admitir o que não se sabe é sinal de qualidade editorial — e é exatamente o oposto
   do perfil que o Google penaliza.

---

## 6. Formatação

- Markdown. `##` para secções, `###` só se uma secção precisar mesmo de subdivisão.
- **Negrito** no máximo 3 vezes por artigo, sempre sobre informação, nunca sobre ênfase emocional.
- Listas só quando a informação é mesmo uma lista (números, cronologia, intervenientes).
- Comprimento alvo: **650–900 palavras**. Abaixo de 500 é conteúdo fino — o validador rejeita.
- Sem emojis. Sem hashtags. Sem "Leia também" gerado por IA.
- Nomes próprios completos na primeira menção, apelido depois.
- Números até dez por extenso, exceto resultados, minutos, valores e idades.

---

## 7. SEO — sem deformar o texto

- `seo_description`: 140–155 caracteres, frase completa, contém o facto principal.
  Não é o lead copiado.
- `tags`: 3 a 6, do vocabulário controlado (clube, competição, jogador, tema). Sem
  tags inventadas por artigo — criam páginas de arquivo vazias, que são precisamente
  "páginas de pouco valor" aos olhos do Google.
- `slug`: `titulo-em-minusculas-sem-artigos`, máximo 60 caracteres, sem data.
- Palavra-chave uma vez no título, uma vez no lead. Chega. Repetição forçada é sinal
  de spam e lê-se mal.

---

## 8. Checklist de revisão (painel `/admin`)

O cartão da fila de revisão mostra esta lista. O operador não precisa de a percorrer
toda em cada artigo — precisa de a ter à vista para os casos duvidosos.

1. O título promete o que o corpo entrega?
2. O lead é diferente do lead da fonte (abrir o link e comparar)?
3. Existe alguma frase de 8+ palavras igual ao original? (o badge de originalidade já responde)
4. Os três blocos obrigatórios estão lá e o "Porque importa" diz mesmo alguma coisa?
5. Há algum número, nome ou data que não esteja no texto extraído em `sport_facts`?
6. As citações estão atribuídas e são curtas?
7. O artigo lê-se de forma autónoma, sem clicar no original?
8. A variação é diferente da dos artigos anteriores de hoje?
9. A atribuição (`source_name` + link) está presente?
10. Publicaria isto com o seu nome em cima?

Se a resposta a 10 for não, **rejeitar é barato**. Rejeitar não custa nada; uma
suspensão de AdSense custa o projeto.

---

## 9. Ritmo de publicação

Não é um detalhe de operação — é um sinal de qualidade. O padrão que o Google
associa a abuso de conteúdo em escala é volume alto + profundidade fina + zero
edição. Limites por omissão (chave `publishing_limits` em `settings`):

```json
{
  "max_published_per_day": 8,
  "min_minutes_between_publications": 45,
  "max_per_source_per_day": 3,
  "require_manual_edit_every_n": 5
}
```

`require_manual_edit_every_n`: a cada cinco artigos, um tem de passar pelo botão
**Editar** (não só Aprovar) antes de publicar. Obriga a que haja mão humana real no
produto, e nota-se — na qualidade e no registo de `audit_log`.

---

## 10. Páginas que o site tem de ter

Conteúdo bom num site anónimo é rejeitado à mesma. Antes de candidatar ao AdSense:

- `/sobre` — quem publica, com nome real e contacto verificável.
- `/contacto` — email que funciona.
- `/politica-editorial` — como o conteúdo é produzido, incluindo a assistência de IA
  e a revisão humana. Transparência aqui é proteção, não fraqueza.
- `/politica-de-privacidade` — obrigatória para publicidade (cookies, RGPD).
- `/correcoes` — como pedir uma correção, e as correções feitas.
- Página de autor por cada byline, com biografia real (ver `docs/AUTHORS.md`).

E um volume mínimo razoável de artigos publicados antes de se candidatar — um site
com meia dúzia de peças é rejeitado por conteúdo insuficiente, por muito boas que elas
sejam.
