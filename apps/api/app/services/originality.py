"""Portão de originalidade. Determinístico, sem LLM, sem rede.

Transcrito de docs/publicador/ORIGINALITY.md §3 tal como está — o documento pede
explicitamente para não alterar a API pública nem os nomes do relatório se for
melhorado depois.
"""
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
