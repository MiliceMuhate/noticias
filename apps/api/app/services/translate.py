"""
Traduções do site público (settings.translation → content_translations).

Traduz-se o artigo pt JÁ PUBLICADO — a peça que um humano (ou o piloto, dentro
da política que um humano definiu) aprovou —, nunca um rascunho: o que chega às
outras línguas é exatamente o que foi aprovado em português, incluindo edições
feitas à mão no painel (source_hash deteta-as e volta a traduzir).

Cadeia por (artigo, língua):

1. Geração. Duas vias, conforme a língua de chegada:
   - outra língua que não a da fonte → `translate`: tradução do pt publicado;
   - A MESMA língua da fonte (quase sempre o inglês) → `transcreate`: NÃO é uma
     tradução. Traduzir a reescrita pt de volta para a língua da fonte tende a
     recair na formulação da notícia original — foi pedido explicitamente que a
     versão nessa língua ficasse diferente do original a todo o custo, e isso
     tem de começar na escrita, não só na verificação. O artigo pt serve de
     plano (ângulo, secções, factos por secção) e a ficha de factos de
     matéria-prima; cada frase é escrita de raiz, com lead e título num molde
     diferente do de uma notícia de agência. Como em P3, o modelo nunca vê o
     texto da fonte.
2. Distância à fonte (guardrail #2) — rede de segurança. Portão determinístico
   contra o texto da fonte; na mesma língua o critério é o mais rigoroso (todas
   as medidas de proximidade, e o título, em "pass" — não basta não bloquear).
   Se falhar, `translate_distance` reescreve só as frases marcadas, até
   MAX_DISTANCE_ROUNDS vezes; se mesmo assim não passar → `blocked`.
3. `translate_audit` — fidelidade ao pt e naturalidade. "bloquear" → `blocked`;
   "rever" → `translate_fix` corrige os problemas assinalados e volta a passar
   por 2 e 3 uma vez.
4. `ready` só se passar tudo. Um operador revê uma amostra no painel e pode
   retirar uma tradução (`withdrawn`, função review_translation).
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from ..db import supabase
from ..llm import UsageTracker, complete_json
from ..log import log, log_error
from ..prompts import render
from ..settings_store import DEFAULT_TRANSLATION, get_settings, settings_dict
from .entities import entities_from_facts
from .facts import FactSheet
from .originality import OriginalityReport, check as check_originality

LANGUAGE_NAMES = {"en": "inglês", "es": "espanhol", "fr": "francês"}

# só a proximidade com o texto da fonte decide aqui — estrutura, comprimento e
# autossemelhança já foram avaliados (e aprovados) no artigo pt
_SIMILARITY_KEYS = {"longest_common_run", "containment_5", "jaccard_5", "sentence_overlap"}
# mesma língua da fonte: também o título conta, e basta "review" para falhar
_SAME_LANG_KEYS = _SIMILARITY_KEYS | {"title_overlap"}

MAX_DISTANCE_ROUNDS = 2

_STRICT = ConfigDict(extra="forbid")


class TranslationResult(BaseModel):
    model_config = _STRICT
    titulo: str
    dek: str
    seo_description: str
    tags: list[str] = Field(default_factory=list)
    slug: str
    body: str


TRANSLATION_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "titulo": {"type": "string"},
        "dek": {"type": "string"},
        "seo_description": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "slug": {"type": "string"},
        "body": {"type": "string"},
    },
    "required": ["titulo", "dek", "seo_description", "tags", "slug", "body"],
    "additionalProperties": False,
}

DISTANCE_SCHEMA: dict = {
    "type": "object",
    "properties": {"titulo": {"type": "string"}, "body": {"type": "string"}},
    "required": ["titulo", "body"],
    "additionalProperties": False,
}


class AuditProblem(BaseModel):
    model_config = _STRICT
    trecho: str
    tipo: Literal["fidelidade", "naturalidade"]
    explicacao: str


class TranslationAudit(BaseModel):
    model_config = _STRICT
    problemas: list[AuditProblem] = Field(default_factory=list)
    veredicto: Literal["aprovado", "rever", "bloquear"]
    resumo: str


AUDIT_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "problemas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "trecho": {"type": "string"},
                    "tipo": {"type": "string", "enum": ["fidelidade", "naturalidade"]},
                    "explicacao": {"type": "string"},
                },
                "required": ["trecho", "tipo", "explicacao"],
                "additionalProperties": False,
            },
        },
        "veredicto": {"type": "string", "enum": ["aprovado", "rever", "bloquear"]},
        "resumo": {"type": "string"},
    },
    "required": ["problemas", "veredicto", "resumo"],
    "additionalProperties": False,
}

# Nota ao auditor quando a versão foi escrita de raiz (transcreate): a ordem e a
# construção das frases diferem do pt de propósito — só os factos contam.
_TRANSCREATION_NOTE = (
    "NOTA: esta versão NÃO é uma tradução literal — foi escrita de raiz a partir do "
    "artigo português, de propósito com outras frases, outra ordem dentro dos "
    "parágrafos, outro lead e outro título. Isso não é um problema. Em FIDELIDADE, "
    "verificas só os factos (nada alterado, acrescentado ou em falta); em "
    "NATURALIDADE, a qualidade do texto em si."
)


def source_hash(item: dict[str, Any]) -> str:
    return hashlib.md5(f"{item.get('title') or ''}\n{item.get('body') or ''}".encode("utf-8")).hexdigest()


def _clean_slug(slug: str) -> str:
    s = unicodedata.normalize("NFKD", slug.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:90] or "artigo"


# palavras funcionais muito frequentes — chega para distinguir en/es/fr/pt num
# texto de notícia com centenas de palavras (não é deteção de língua genérica)
_STOPWORDS: dict[str, set[str]] = {
    "en": {"the", "and", "of", "to", "in", "is", "was", "for", "with", "his", "he", "that", "on", "at", "by", "it", "have", "has"},
    "es": {"el", "los", "las", "del", "y", "en", "que", "por", "con", "una", "su", "para", "se", "fue", "al", "lo", "es", "como"},
    "fr": {"le", "les", "des", "et", "du", "une", "est", "dans", "que", "pour", "avec", "sur", "au", "il", "qui", "pas", "ont", "aux"},
    "pt": {"o", "os", "as", "do", "da", "dos", "e", "em", "que", "por", "com", "uma", "para", "se", "foi", "ao", "no", "na"},
}


def detect_language(text: str) -> str | None:
    words = re.findall(r"[a-zà-ÿ]+", text.lower())
    if len(words) < 30:
        return None
    scores = {lang: sum(1 for w in words if w in sw) for lang, sw in _STOPWORDS.items()}
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] >= len(words) * 0.08 else None


def _load_source(topic_id: str) -> tuple[str, str, set[str], list[str], str]:
    """(texto da fonte, título da fonte, entidades, citações autorizadas, ficha de factos em JSON)."""
    res = (
        supabase.table("sport_facts")
        .select("data")
        .eq("topic_id", topic_id)
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    data = (res.data or [{}])[0].get("data") or {}
    entities: set[str] = set()
    quotes: list[str] = []
    facts_json = "{}"
    try:
        facts = FactSheet.model_validate(data.get("facts") or {})
        entities = entities_from_facts(facts)
        quotes = [q for c in facts.citacoes for q in (c.texto, c.traducao) if q]
        facts_json = facts.model_dump_json()
    except Exception:
        # artigos antigos (antes da ficha de factos) — mede sem descontar entidades;
        # a escrita de raiz trabalha só a partir do artigo pt
        pass
    return data.get("text") or "", data.get("title") or "", entities, quotes, facts_json


def too_close(report: OriginalityReport, same_lang: bool) -> list[str]:
    """Razões pelas quais a tradução está próxima demais da fonte ([] = ok).
    Mesma língua: qualquer medida fora de "pass" conta. Outra língua: só "block"."""
    keys = _SAME_LANG_KEYS if same_lang else _SIMILARITY_KEYS
    return [
        r for r in report.reasons
        if r.split("=")[0] in keys and (same_lang or r.endswith("=block"))
    ]


def _thresholds() -> dict:
    from .articles import DEFAULT_ORIGINALITY_THRESHOLDS

    return get_settings(["originality_thresholds"]).get("originality_thresholds") or DEFAULT_ORIGINALITY_THRESHOLDS


async def _translate_one(
    item: dict[str, Any], lang: str, quotes: list[str], facts_json: str, same_lang: bool, tracker: UsageTracker
) -> TranslationResult:
    """Fase 1: `translate` noutra língua; `transcreate` (escrita de raiz) na língua da fonte."""
    meta = item.get("metadata") or {}
    language_name = LANGUAGE_NAMES[lang]
    prompt_name = "transcreate" if same_lang else "translate"
    data = await complete_json(
        step="translate",
        system=render(prompt_name, "system", language_name=language_name),
        prompt=render(
            prompt_name,
            "user",
            title=item.get("title") or "",
            dek=meta.get("dek") or "",
            seo_description=meta.get("seo_description") or "",
            tags_json=json.dumps(meta.get("tags") or [], ensure_ascii=False),
            quotes_json=json.dumps(quotes, ensure_ascii=False),
            facts_json=facts_json,
            body=item.get("body") or "",
        ),
        schema=TRANSLATION_SCHEMA,
        max_tokens=6144,
        tracker=tracker,
    )
    return TranslationResult.model_validate(data)


async def _distance_rewrite(
    result: TranslationResult, report: OriginalityReport, reasons: list[str], lang: str, tracker: UsageTracker
) -> TranslationResult:
    """Reescreve só as frases marcadas — o modelo nunca vê o texto da fonte, só as
    NOSSAS frases que ficaram próximas dele (mesmo princípio de P3/P6)."""
    data = await complete_json(
        step="translate",
        system=render("translate_distance", "system", language_name=LANGUAGE_NAMES[lang]),
        prompt=render(
            "translate_distance",
            "user",
            title=result.titulo,
            title_flagged="sim" if any(r.startswith("title_overlap") for r in reasons) else "não",
            flagged_json=json.dumps(report.flagged_spans, ensure_ascii=False),
            body=result.body,
        ),
        schema=DISTANCE_SCHEMA,
        max_tokens=6144,
        tracker=tracker,
    )
    return result.model_copy(update={"titulo": data["titulo"], "body": data["body"]})


async def _audit(
    item: dict[str, Any], result: TranslationResult, lang: str, same_lang: bool, tracker: UsageTracker
) -> TranslationAudit:
    data = await complete_json(
        step="translate_audit",
        system=render(
            "translate_audit",
            "system",
            language_name=LANGUAGE_NAMES[lang],
            mode_note=_TRANSCREATION_NOTE if same_lang else "",
        ),
        prompt=render(
            "translate_audit",
            "user",
            language_name=LANGUAGE_NAMES[lang],
            pt_title=item.get("title") or "",
            pt_body=item.get("body") or "",
            title=result.titulo,
            body=result.body,
        ),
        schema=AUDIT_SCHEMA,
        max_tokens=2048,
        tracker=tracker,
    )
    return TranslationAudit.model_validate(data)


async def _fix(
    item: dict[str, Any], result: TranslationResult, audit: TranslationAudit, lang: str, tracker: UsageTracker
) -> TranslationResult:
    data = await complete_json(
        step="translate",
        system=render("translate_fix", "system", language_name=LANGUAGE_NAMES[lang]),
        prompt=render(
            "translate_fix",
            "user",
            pt_title=item.get("title") or "",
            pt_body=item.get("body") or "",
            translation_json=result.model_dump_json(),
            problems_json=json.dumps([p.model_dump() for p in audit.problemas], ensure_ascii=False),
        ),
        schema=TRANSLATION_SCHEMA,
        max_tokens=6144,
        tracker=tracker,
    )
    return TranslationResult.model_validate(data)


def _record_job(item_id: str, lang: str, title: str | None, tracker: UsageTracker, error: str | None) -> None:
    supabase.table("jobs").insert(
        {
            "type": "translate-article",
            "content_item_id": item_id,
            "payload": {"lang": lang, "title": title, "models": sorted(tracker.models)},
            "status": "failed" if error else "done",
            "attempts": 1,
            "error": error,
            "input_tokens": tracker.input_tokens,
            "output_tokens": tracker.output_tokens,
            "cost_usd": round(tracker.cost_usd, 6),
        }
    ).execute()


def _upsert(row: dict[str, Any]) -> None:
    try:
        supabase.table("content_translations").upsert(row, on_conflict="content_item_id,lang").execute()
    except Exception as err:
        # slug já usado por outro artigo nesta língua — desambigua com o id
        if "23505" in str(err) and row.get("slug"):
            row = {**row, "slug": f"{row['slug']}-{row['content_item_id'][:6]}"}
            supabase.table("content_translations").upsert(row, on_conflict="content_item_id,lang").execute()
        else:
            raise


class _Distance:
    """Resultado da fase 2: tradução (possivelmente reescrita), relatório e
    razões que ainda sobram ([] = passou)."""

    def __init__(self, result: TranslationResult, report: OriginalityReport | None, reasons: list[str]):
        self.result, self.report, self.reasons = result, report, reasons


async def _enforce_distance(
    result: TranslationResult,
    source: tuple[str, str, set[str], list[str], str],
    lang: str,
    same_lang: bool,
    tracker: UsageTracker,
) -> _Distance:
    source_text, source_title, entities, quotes, _facts = source
    if not source_text:
        # sem fonte gravada não há contra o que medir — não se arrisca publicar
        return _Distance(result, None, ["sem texto da fonte para comparar"])
    thresholds = _thresholds()
    for round_no in range(MAX_DISTANCE_ROUNDS + 1):
        # título na primeira linha: o portão mede title_overlap pela 1.ª linha
        report = check_originality(
            f"{result.titulo}\n\n{result.body}",
            source_text,
            source_title,
            entities=entities,
            allowed_quotes=quotes,
            recent_bodies=[],
            thresholds=thresholds,
        )
        reasons = too_close(report, same_lang)
        if not reasons or round_no == MAX_DISTANCE_ROUNDS:
            return _Distance(result, report, reasons)
        result = await _distance_rewrite(result, report, reasons, lang, tracker)
    raise AssertionError("inalcançável")


async def translate_item(item: dict[str, Any], lang: str, attempts_before: int) -> str:
    """Traduz um artigo para `lang` e grava. Devolve o estado final."""
    tracker = UsageTracker()
    base = {
        "content_item_id": item["id"],
        "lang": lang,
        "source_hash": source_hash(item),
        "attempts": attempts_before + 1,
    }
    try:
        source = _load_source(item["topic_id"])
        same_lang = detect_language(source[0]) == lang

        result = await _translate_one(item, lang, source[3], source[4], same_lang, tracker)
        distance = await _enforce_distance(result, source, lang, same_lang, tracker)

        audit: TranslationAudit | None = None
        error: str | None = None
        if distance.reasons:
            error = f"próxima demais da fonte{' (mesma língua)' if same_lang else ''}: {', '.join(distance.reasons)}"
        else:
            audit = await _audit(item, distance.result, lang, same_lang, tracker)
            if audit.veredicto == "rever":
                fixed = await _fix(item, distance.result, audit, lang, tracker)
                distance = await _enforce_distance(fixed, source, lang, same_lang, tracker)
                if distance.reasons:
                    error = f"próxima demais da fonte após correção: {', '.join(distance.reasons)}"
                else:
                    audit = await _audit(item, distance.result, lang, same_lang, tracker)
            if not error and audit.veredicto == "bloquear":
                error = f"auditoria de fidelidade: {audit.resumo}"
            # "rever" depois da correção publica, mas fica no topo da amostragem
            # humana do painel (Configuração → Traduções)

        final = distance.result
        status = "blocked" if error else "ready"
        _upsert(
            {
                **base,
                "status": status,
                "title": final.titulo,
                "body": final.body,
                "dek": final.dek,
                "seo_description": final.seo_description,
                "tags": final.tags,
                "slug": _clean_slug(final.slug),
                "originality": {**distance.report.as_metadata(), "same_language_as_source": same_lang}
                if distance.report
                else None,
                "audit": audit.model_dump() if audit else None,
                "error": error,
                "reviewed_by": None,
                "reviewed_at": None,
            }
        )
        _record_job(item["id"], lang, item.get("title"), tracker, None)
        log("translate", f'content_item {item["id"]} → {lang}: {status}{" (" + error + ")" if error else ""}')
        return status
    except Exception as err:
        log_error("translate", f'content_item {item["id"]} → {lang} falhou', err)
        _upsert({**base, "status": "failed", "error": str(err)[:1000]})
        _record_job(item["id"], lang, item.get("title"), tracker, str(err)[:1000])
        return "failed"


# 'withdrawn' (retirada por um operador) nunca volta a ser gerada sozinha
_RETRY_STATUSES = {"failed", "blocked"}


async def translate_published(limit: int = 6) -> None:
    """Ciclo do scheduler: traduz o que falta (ou ficou desatualizado) nos
    artigos publicados mais recentes. `limit` = traduções por ciclo."""
    cfg = settings_dict(get_settings(["translation"]), "translation", DEFAULT_TRANSLATION)
    if not cfg.get("enabled"):
        return
    languages = [lang for lang in (cfg.get("languages") or []) if lang in LANGUAGE_NAMES]
    max_attempts = int(cfg.get("max_attempts") or 3)
    if not languages:
        return

    items = (
        supabase.table("content_items")
        .select("id, topic_id, title, body, metadata")
        .eq("status", "published")
        .order("published_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    if not items:
        return
    existing = (
        supabase.table("content_translations")
        .select("content_item_id, lang, status, source_hash, attempts")
        .in_("content_item_id", [i["id"] for i in items])
        .execute()
        .data
        or []
    )
    by_key = {(r["content_item_id"], r["lang"]): r for r in existing}

    done = 0
    for item in items:
        current_hash = source_hash(item)
        for lang in languages:
            if done >= limit:
                return
            row = by_key.get((item["id"], lang))
            if row is None:
                attempts = 0
            elif row["source_hash"] != current_hash:
                attempts = 0  # o pt mudou — tradução nova, contador do zero
            elif row["status"] in _RETRY_STATUSES and (row.get("attempts") or 0) < max_attempts:
                attempts = row.get("attempts") or 0
            else:
                continue
            await translate_item(item, lang, attempts)
            done += 1
