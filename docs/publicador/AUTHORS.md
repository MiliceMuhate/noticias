# AUTHORS — Autoria, vozes e transparência

> `content_items.author` já existe no modelo de dados, descrito como "sinal E-E-A-T".
> Este documento define o que lá pode ir — e o que não pode, por razões que são ao
> mesmo tempo éticas e de sobrevivência do projeto.

---

## 1. A decisão que tem de ser tomada primeiro

Há duas formas de preencher `author`, e só uma delas é defensável.

**Opção A — personas humanas fictícias.** Inventar "Ricardo Faria, jornalista
desportivo há 12 anos", com fotografia gerada e biografia credível. É o que muitos
sites fazem. Também é: (a) afirmar credenciais falsas para ganhar confiança do leitor,
que é o núcleo do que o Google classifica como comportamento enganoso; (b) uma bomba
relógio — basta um leitor procurar o nome e não encontrar nada; (c) indefensável se
algum dia for preciso justificar o site a alguém.

**Opção B — autoria transparente.** A responsabilidade editorial é de uma pessoa real
(o operador). As vozes existem, mas como **editorias**, não como pessoas falsas.
Recomendado, e é o que o resto deste documento assume.

Na prática, na Opção B, `content_items.author` guarda:

```json
{
  "byline": "Redação Bola Fora",
  "desk": "transferencias",
  "editor": "Nome Real do Operador",
  "ai_assisted": true
}
```

E o artigo publicado mostra, por baixo do título:

> **Redação Bola Fora** · Secção Transferências
> Texto produzido com assistência de IA a partir de fontes noticiosas, revisto e
> aprovado por **Nome Real do Operador** antes da publicação. [Como trabalhamos](/politica-editorial)

Isto não afasta leitores. Sinaliza processo, que é precisamente o que falta aos sites
que o Google penaliza. E torna a página `/politica-editorial` num ativo em vez de
numa formalidade.

**Se ainda assim escolher a Opção A**, três limites mínimos: nenhuma biografia que
afirme experiência, prémios, presença em jogos ou formação académica; nenhuma
fotografia de pessoa (real ou gerada); e o disclaimer de IA na mesma, porque é ele que
faz a diferença entre uma assinatura de secção e uma mentira.

---

## 2. As secções (desks)

Quatro editorias. Cada uma tem um âmbito, uma voz ligeiramente distinta e um conjunto
de variações preferidas. A voz muda o suficiente para que dois artigos seguidos não
soem ao mesmo texto, sem nunca sair do manual de `EDITORIAL.md`.

### `resultados` — Jogos e classificações

- **Âmbito:** relatos de jogo, resultados, classificações, sequências.
- **Voz:** rápida, factual, cronológica. Frases curtas. O resultado no lead, sempre.
- **Variações preferidas:** `os_numeros`, `o_impacto_tatico`.
- **Não faz:** adjetivação de golos, narrativa de emoção, julgamento de arbitragem.

### `transferencias` — Mercado

- **Âmbito:** negócios, renovações, cláusulas, rumores atribuídos.
- **Voz:** cautelosa e explícita sobre o grau de confirmação. Distingue sempre
  "acordado", "em negociação" e "noticiado por".
- **Variações preferidas:** `cronologia`, `as_contas`, `as_pecas`.
- **Não faz:** tratar rumor como facto, prever destinos, somar valores não confirmados.

### `analise` — Contexto e leitura

- **Âmbito:** o que um conjunto de factos significa para a época, a competição, o plantel.
- **Voz:** mais pausada, com parágrafos ligeiramente maiores. Argumenta a partir dos
  factos da ficha, nunca a partir de opinião não fundamentada.
- **Variações preferidas:** `o_precedente`, `o_impacto_tatico`, `os_numeros`.
- **Não faz:** previsões, apostas, notas a jogadores.

### `institucional` — Clubes, federações, regulamentos

- **Âmbito:** decisões de direção, castigos, regras, calendários, finanças de clube.
- **Voz:** sóbria, quase administrativa. Cita documentos e comunicados pelo nome.
- **Variações preferidas:** `cronologia`, `as_pecas`, `as_contas`.
- **Não faz:** especulação sobre motivações, linguagem de conflito.

---

## 3. Como é atribuída

Regra em `apps/api`, depois de P1 (a ficha já traz `tipo`):

| `facts.tipo` | desk |
|---|---|
| `jogo`, `competicao` | `resultados` |
| `transferencia` | `transferencias` |
| `lesao`, `declaracao` | `analise` |
| `institucional` | `institucional` |
| `outro` | `analise` |

A voz do desk entra em P3 (`{author_persona}`) e as variações preferidas entram em P2
como sugestão — não como obrigação, porque a regra de não repetir a variação dos três
artigos anteriores tem prioridade.

Guardar as personas em `settings` (chave `authors`, já prevista no `DATA_MODEL.md`),
não em código: permite afinar a voz sem *deploy*.

---

## 4. Página de secção

Cada desk tem página própria (`/seccao/transferencias`), com:

- Descrição do âmbito, em linguagem de leitor, não de especificação.
- Que fontes alimentam a secção (nomes dos sites, ligados).
- Os artigos publicados, por ordem cronológica.

Estas páginas resolvem dois problemas ao mesmo tempo: dão profundidade de navegação ao
site (que a candidatura ao AdSense avalia) e tornam a atribuição verificável — um
leitor consegue perceber de onde vem a informação sem abrir um único artigo.

---

## 5. Correções

Ter uma política de correções ativa é dos sinais de credibilidade mais baratos que
existem, e quase nenhum site automatizado o tem.

- `/correcoes` lista as correções feitas, com data e o que mudou.
- Um artigo corrigido mostra, no fim: *"Atualizado a [data]: [o que mudou]."*
- Tecnicamente já é quase grátis: `audit_log` com `action='edit'` e `detail` a guardar
  o antes/depois. Falta só a view pública que os expõe.

Se algum dia surgir uma queixa de direitos de autor de uma fonte, este é o mecanismo
que permite responder em horas em vez de dias — e o registo que prova que há um
processo editorial real por trás do site.
