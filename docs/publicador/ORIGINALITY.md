# ORIGINALITY — Portão de originalidade e conformidade

> O risco que decide se este projeto vive: publicar conteúdo demasiado parecido com a
> fonte. Perde-se o AdSense, perde-se a indexação, e nenhuma das duas coisas se
> recupera depressa. Este documento define como é que isso é **medido por código**,
> antes de qualquer humano ver o artigo.

---

## 1. Os dois riscos, que são diferentes

**Risco A — sobreposição com a fonte.** O nosso artigo reproduz passagens do original.
É risco de direitos de autor e de classificação como conteúdo raspado. Mede-se
comparando o corpo gerado com `sport_facts.data.text`.

**Risco B — sobreposição connosco próprios.** Dois feeds noticiam o mesmo jogo, o
sistema gera dois artigos quase iguais sobre o mesmo acontecimento. É risco de
conteúdo duplicado interno, e é mais comum do que o A num agregador de RSS. Mede-se
comparando com os artigos publicados nas últimas 72 horas.

Os dois são verificados no mesmo passo, antes de criar o `content_item`.

---

## 2. Métricas

Todas sobre tokens normalizados (minúsculas, sem acentos, sem pontuação, dígitos
preservados). Sem remover *stopwords*: são elas que denunciam a paráfrase preguiçosa.

| Métrica | O que responde | Limiar `pass` | `review` | `block` |
|---|---|---|---|---|
| `longest_common_run` | Maior sequência de palavras idêntica | ≤ 7 | 8–11 | ≥ 12 |
| `containment_5` | % dos 5-gramas do nosso texto que existem na fonte | ≤ 4% | 4–9% | > 9% |
| `jaccard_5` | Semelhança global dos dois textos | ≤ 0,06 | 0,06–0,12 | > 0,12 |
| `sentence_overlap` | % de frases nossas com 5-grama em comum | ≤ 10% | 10–20% | > 20% |
| `title_overlap` | Palavras significativas partilhadas com o título da fonte | ≤ 50% | 50–65% | > 65% |
| `word_count` | Dimensão | ≥ 600 | 500–599 | < 500 |
| `structure_ok` | Blocos obrigatórios presentes (`EDITORIAL.md` §3) | todos | — | falta algum |
| `self_similarity` | `containment_5` contra artigos das últimas 72h | ≤ 6% | 6–12% | > 12% |

**Estes números são um ponto de partida, não uma verdade.** Calibrar com os primeiros
20 artigos: correr o cálculo, ler os artigos, e apertar ou afrouxar. Um limiar que
bloqueia tudo é tão inútil como um que não bloqueia nada. Guardar em `settings`
(chave `originality_thresholds`) para poder ajustar sem novo *deploy*:

```json
{
  "longest_common_run": { "pass": 7,    "block": 11   },
  "containment_5":      { "pass": 0.04, "block": 0.09 },
  "jaccard_5":          { "pass": 0.06, "block": 0.12 },
  "sentence_overlap":   { "pass": 0.10, "block": 0.20 },
  "title_overlap":      { "pass": 0.50, "block": 0.65 },
  "self_similarity":    { "pass": 0.06, "block": 0.12 },
  "word_count":         { "pass": 600,  "block": 500  }
}
```

Entre `pass` e `block` fica a zona de `review`. Para `word_count` a leitura é
invertida (mais é melhor) — o código trata disso com `higher_is_worse=False`.

**Exceções que não contam como sobreposição:**

- Nomes próprios, clubes, competições, estádios (um dicionário de entidades vindo da
  ficha de factos, mais uma lista base).
- Citações entre aspas presentes na ficha, com atribuição — até 25 palavras cada,
  máximo duas. Removidas do corpo antes de calcular, e contadas à parte.
- Expressões fixas do domínio: "grande penalidade", "tempo de compensação",
  "cartão amarelo", "fase de grupos", "janela de transferências".

Sem estas exceções, o `longest_common_run` dispara em qualquer artigo que mencione
"Liga dos Campeões da UEFA" — e o gate perde utilidade por excesso de zelo.

---

## 3. Implementação

Ficheiro novo: `apps/api/app/services/originality.py`.

```python
"""Portão de originalidade. Determinístico, sem LLM, sem rede."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field, asdict

_WORD = re.compile(r"[0-9a-z]+")
_SENT = re.compile(r"(?<=[.!?])\s+")
_QUOTE = re.compile(r"[«\"“](.{5,400}?)[»\"”]", re.DOTALL)
_MD = re.compile(r"(^#{1,6}\s+|\*\*|\*|`|\[|\]\([^)]*\)|^>\s*|^[-*]\s+)", re.MULTILINE)

N = 5  # tamanho do shingle


def normalize(text: str) -> str:
    text = _MD.sub(" ", text)
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text


def tokens(text: str, stop_entities: set[str] | None = None) -> list[str]:
    words = _WORD.findall(normalize(text))
    if stop_entities:
        words = [w for w in words if w not in stop_entities]
    return words


def shingles(toks: list[str], n: int = N) -> set[tuple[str, ...]]:
    if len(toks) < n:
        return set()
    return {tuple(toks[i:i + n]) for i in range(len(toks) - n + 1)}


def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def containment(a: set, b: set) -> float:
    """Fração de A que também existe em B. Assimétrico — é o que queremos."""
    return len(a & b) / len(a) if a else 0.0


def longest_common_run(a_toks: list[str], b_toks: list[str], cap: int = 40) -> int:
    """Maior sequência de palavras comum, por procura binária sobre shingles.
    Muito mais rápido que DP para textos desta dimensão."""
    lo, hi, best = 1, min(cap, len(a_toks), len(b_toks)), 0
    while lo <= hi:
        mid = (lo + hi) // 2
        if shingles(a_toks, mid) & shingles(b_toks, mid):
            best, lo = mid, mid + 1
        else:
            hi = mid - 1
    return best


def strip_allowed_quotes(body: str, allowed: list[str]) -> tuple[str, list[str]]:
    """Retira citações autorizadas antes de medir; devolve também as não autorizadas."""
    allowed_norm = {" ".join(tokens(q)) for q in allowed}
    unauthorized: list[str] = []

    def _sub(m: re.Match) -> str:
        quoted = m.group(1)
        if " ".join(tokens(quoted)) in allowed_norm:
            return " "
        unauthorized.append(quoted)
        return " " + quoted + " "

    return _QUOTE.sub(_sub, body), unauthorized


@dataclass
class OriginalityReport:
    longest_common_run: int = 0
    containment_5: float = 0.0
    jaccard_5: float = 0.0
    sentence_overlap: float = 0.0
    title_overlap: float = 0.0
    self_similarity: float = 0.0
    word_count: int = 0
    structure_ok: bool = True
    missing_sections: list[str] = field(default_factory=list)
    unauthorized_quotes: list[str] = field(default_factory=list)
    flagged_spans: list[str] = field(default_factory=list)
    verdict: str = "pass"          # pass | review | block
    reasons: list[str] = field(default_factory=list)

    def as_metadata(self) -> dict:
        return asdict(self)


REQUIRED_SECTIONS = ("## o que aconteceu", "## porque", "## o que vem a seguir")


def check(
    body: str,
    source_text: str,
    source_title: str,
    *,
    entities: set[str],
    allowed_quotes: list[str],
    recent_bodies: list[str],
    thresholds: dict,
) -> OriginalityReport:
    r = OriginalityReport()

    clean, r.unauthorized_quotes = strip_allowed_quotes(body, allowed_quotes)
    b_toks = tokens(clean, stop_entities=entities)
    s_toks = tokens(source_text, stop_entities=entities)
    r.word_count = len(tokens(clean))

    b_sh, s_sh = shingles(b_toks), shingles(s_toks)
    r.containment_5 = round(containment(b_sh, s_sh), 4)
    r.jaccard_5 = round(jaccard(b_sh, s_sh), 4)
    r.longest_common_run = longest_common_run(b_toks, s_toks)

    sentences = [s for s in _SENT.split(clean) if len(tokens(s)) >= N]
    hits = [s for s in sentences if shingles(tokens(s, entities)) & s_sh]
    r.sentence_overlap = round(len(hits) / len(sentences), 4) if sentences else 0.0
    r.flagged_spans = hits[:10]

    t_b, t_s = set(tokens(body.split("\n")[0], entities)), set(tokens(source_title, entities))
    r.title_overlap = round(len(t_b & t_s) / len(t_s), 4) if t_s else 0.0

    if recent_bodies:
        r.self_similarity = round(
            max(containment(b_sh, shingles(tokens(p, entities))) for p in recent_bodies), 4
        )

    low = body.lower()
    r.missing_sections = [s for s in REQUIRED_SECTIONS if s not in low]
    r.structure_ok = not r.missing_sections

    # --- veredicto -------------------------------------------------------
    t = thresholds
    def level(value, key, higher_is_worse=True):
        p, b = t[key]["pass"], t[key]["block"]
        if higher_is_worse:
            return "block" if value > b else ("pass" if value <= p else "review")
        return "block" if value < b else ("pass" if value >= p else "review")

    checks = {
        "longest_common_run": level(r.longest_common_run, "longest_common_run"),
        "containment_5": level(r.containment_5, "containment_5"),
        "jaccard_5": level(r.jaccard_5, "jaccard_5"),
        "sentence_overlap": level(r.sentence_overlap, "sentence_overlap"),
        "title_overlap": level(r.title_overlap, "title_overlap"),
        "self_similarity": level(r.self_similarity, "self_similarity"),
        "word_count": level(r.word_count, "word_count", higher_is_worse=False),
    }
    if not r.structure_ok:
        checks["structure"] = "block"
    if r.unauthorized_quotes:
        checks["unauthorized_quotes"] = "review"

    r.reasons = [f"{k}={checks[k]}" for k in checks if checks[k] != "pass"]
    r.verdict = ("block" if "block" in checks.values()
                 else "review" if "review" in checks.values()
                 else "pass")
    return r
```

### Onde encaixa em `generate_pending`

```
fetch_source_article → sport_facts
  ↓
P1 extract_facts  (porta: factos < 4 → rejected)
  ↓
P2 editorial_brief (porta: viavel=false → rejected)
  ↓
P3 write_article
  ↓
originality.check(...)                   ← determinístico, grátis, instantâneo
  ↓
P5 self_audit                            ← só se check ≠ block, para poupar tokens
  ↓
block → P6 rewrite_flagged → check outra vez → ainda block? topic='failed'
pass/review → P4 package → content_items(pending_review,
                                         metadata.originality = report)
```

Correr o gate **antes** do `self_audit` é intencional: quando o texto é obviamente
demasiado próximo, não se gasta uma chamada de LLM a confirmar o óbvio.

### O que o painel mostra

No cartão da fila de revisão, um distintivo por artigo:

- 🟢 **Original** — `pass`. Só o número: `LCR 5 · 2,1%`.
- 🟡 **Verificar** — `review`. Lista dos motivos e as frases assinaladas realçadas no
  corpo, com o trecho correspondente da fonte ao lado.
- 🔴 nunca chega ao painel: `block` não cria `content_item`.

O realce lado-a-lado é o que torna a revisão rápida. Sem ele, "verificar fidelidade"
significa ler dois artigos inteiros, e ao décimo artigo do dia ninguém lê.

---

## 4. Testes obrigatórios

`apps/api/tests/test_originality.py` — estes casos têm de existir antes de o gate
ser considerado feito:

1. **Cópia integral** do texto da fonte como corpo → `block`, `containment_5` > 0,9.
2. **Paráfrase por sinónimos** (mesma estrutura, palavras trocadas) → pelo menos
   `review` via `sentence_overlap`.
3. **Artigo legítimo** escrito à mão sobre os mesmos factos → `pass`.
4. **Citação autorizada** de 20 palavras idêntica à fonte → `pass` (não conta).
5. **Citação não autorizada** de 30 palavras → `review`, aparece em `unauthorized_quotes`.
6. **Dois artigos nossos** sobre o mesmo jogo → segundo dá `self_similarity` alto.
7. **Entidades:** artigo cheio de "Liga dos Campeões da UEFA" → não dispara `longest_common_run`.
8. **Estrutura:** corpo sem "O que vem a seguir" → `block`.

---

## 5. Conformidade ao nível do site

O gate trata do texto. A aprovação do AdSense olha para o site inteiro, e é aqui que a
maioria das candidaturas cai. Os motivos de recusa mais comuns são conteúdo
insuficiente, conteúdo copiado de outras fontes e conteúdo mal redigido; os critérios
básicos incluem domínio próprio, dados de candidatura exatos e coerentes com o
domínio, conteúdo original com valor e conformidade com as diretrizes de qualidade do
Google.

Um ponto que costuma ser mal compreendido: o problema não é só copiar sem crédito. Um
site cujo conteúdo é essencialmente material de terceiros, ainda que devidamente
creditado, também levanta objeção — o crédito resolve a questão de direitos de autor,
não a de valor próprio. É exatamente por isso que os blocos originais de
`EDITORIAL.md` §3 não são decorativos: são o que distingue este site de um mural de
citações.

**Antes de candidatar:**

- [ ] Domínio próprio, não subdomínio de plataforma.
- [ ] 25–30 artigos publicados, todos com `verdict: pass` e revisão humana registada.
- [ ] `/sobre`, `/contacto`, `/politica-editorial`, `/politica-de-privacidade`, `/correcoes`.
- [ ] Página de autor por cada byline, com biografia real e verificável.
- [ ] Divulgação clara de como o conteúdo é produzido (IA + revisão humana). Não é
      opcional e não prejudica: opacidade é que prejudica.
- [ ] Zero páginas em construção, zero categorias vazias, zero tags com um artigo.
- [ ] `robots.txt` e `sitemap.xml` corretos; páginas de arquivo finas com `noindex`.
- [ ] Nenhum artigo publicado sem o bloco de fonte visível.
- [ ] Navegação real: um leitor consegue encontrar artigos antigos sem pesquisa.

**Depois de aprovado, o que mantém a aprovação:** os limites de ritmo de
`EDITORIAL.md` §9, o gate a correr em todos os artigos, e o `audit_log` a provar que
houve uma decisão humana por cada publicação. Se algum dia for preciso responder ao
Google, é esse registo que responde.

**Limitação honesta:** nenhum destes números garante aprovação. O Google não publica
os limiares que usa e a avaliação inclui julgamento humano. O que estas métricas
garantem é que não se publica nada que falhe nos critérios óbvios — e que, quando
algo falhar, se saiba exatamente o quê.
