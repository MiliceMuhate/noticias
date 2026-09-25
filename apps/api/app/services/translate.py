"""
Traduções do site público (settings.translation → content_translations).

Traduz-se o artigo pt JÁ PUBLICADO — a peça que um humano (ou o piloto, dentro
da política que um humano definiu) aprovou —, nunca um rascunho: o que chega às
outras línguas é exatamente o que foi aprovado em português, incluindo edições
feitas à mão no painel (source_hash deteta-as e volta a traduzir).

Guardrail #2 nas traduções: a fonte original está quase sempre em inglês, e
traduzir a reescrita pt de volta para inglês pode reaproximá-la do texto
original. Por isso cada tradução passa pelo mesmo portão determinístico de
originalidade contra o texto da fonte — aqui, ao contrário do pt, a comparação
palavra a palavra é mesmo significativa (mesma língua) — e só fica visível
(`ready`) se não bloquear.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from ..db import supabase
from ..llm import UsageTracker, complete_json
from ..log import log, log_error
from ..prompts import render
from ..settings_store import DEFAULT_TRANSLATION, get_settings, settings_dict
from .entities import entities_from_facts
from .facts import FactSheet
from .originality import check as check_originality

LANGUAGE_NAMES = {"en": "inglês", "es": "espanhol", "fr": "francês"}

# só a proximidade com o texto da fonte decide aqui — estrutura, comprimento e
# autossemelhança já foram avaliados (e aprovados) no artigo pt
_BLOCKING_KEYS = {"longest_common_run", "containment_5", "jaccard_5", "sentence_overlap"}

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


def source_hash(item: dict[str, Any]) -> str:
    return hashlib.md5(f"{item.get('title') or ''}\n{item.get('body') or ''}".encode("utf-8")).hexdigest()


def _clean_slug(slug: str) -> str:
    s = unicodedata.normalize("NFKD", slug.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:90] or "artigo"


def _load_source(topic_id: str) -> tuple[str, str, set[str], list[str]]:
    """(texto da fonte, título da fonte, entidades, citações autorizadas)."""
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
    try:
        facts = FactSheet.model_validate(data.get("facts") or {})
        entities = entities_from_facts(facts)
        quotes = [q for c in facts.citacoes for q in (c.texto, c.traducao) if q]
    except Exception:
        # artigos antigos (antes da ficha de factos) — mede sem descontar entidades
        pass
    return data.get("text") or "", data.get("title") or "", entities, quotes


async def _translate_one(item: dict[str, Any], lang: str, quotes: list[str], tracker: UsageTracker) -> TranslationResult:
    meta = item.get("metadata") or {}
    language_name = LANGUAGE_NAMES[lang]
    data = await complete_json(
        step="translate",
        system=render("translate", "system", language_name=language_name),
        prompt=render(
            "translate",
            "user",
            title=item.get("title") or "",
            dek=meta.get("dek") or "",
            seo_description=meta.get("seo_description") or "",
            tags_json=json.dumps(meta.get("tags") or [], ensure_ascii=False),
            quotes_json=json.dumps(quotes, ensure_ascii=False),
            body=item.get("body") or "",
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
        source_text, source_title, entities, quotes = _load_source(item["topic_id"])
        result = await _translate_one(item, lang, quotes, tracker)
        # sem fonte gravada não há contra o que medir — não se arrisca publicar
        status, report_meta, reasons = "blocked", None, ["sem texto da fonte para comparar"]
        if source_text:
            report = check_originality(
                result.body,
                source_text,
                source_title,
                entities=entities,
                allowed_quotes=quotes,
                recent_bodies=[],
                thresholds=get_settings(["originality_thresholds"]).get("originality_thresholds") or _fallback_thresholds(),
            )
            report_meta = report.as_metadata()
            reasons = [r for r in report.reasons if r.split("=")[0] in _BLOCKING_KEYS and r.endswith("=block")]
            status = "blocked" if reasons else "ready"
        _upsert(
            {
                **base,
                "status": status,
                "title": result.titulo,
                "body": result.body,
                "dek": result.dek,
                "seo_description": result.seo_description,
                "tags": result.tags,
                "slug": _clean_slug(result.slug),
                "originality": report_meta,
                "error": f"próxima demais da fonte: {', '.join(reasons)}" if status == "blocked" else None,
            }
        )
        _record_job(item["id"], lang, item.get("title"), tracker, None)
        log("translate", f'content_item {item["id"]} → {lang}: {status}')
        return status
    except Exception as err:
        log_error("translate", f'content_item {item["id"]} → {lang} falhou', err)
        _upsert({**base, "status": "failed", "error": str(err)[:1000]})
        _record_job(item["id"], lang, item.get("title"), tracker, str(err)[:1000])
        return "failed"


def _fallback_thresholds() -> dict:
    from .articles import DEFAULT_ORIGINALITY_THRESHOLDS

    return DEFAULT_ORIGINALITY_THRESHOLDS


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
            elif row["status"] != "ready" and (row.get("attempts") or 0) < max_attempts:
                attempts = row.get("attempts") or 0
            else:
                continue
            await translate_item(item, lang, attempts)
            done += 1
