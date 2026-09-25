"""
Orquestrador da cadeia de 6 passos (docs/publicador/PROMPTS.md): P1 ficha de factos
-> P2 briefing -> P3 escrita (sem ver o original) -> portão determinístico
-> P5 auditoria -> (se bloqueado) P6 reescrita dirigida -> P4 empacotamento.

Guardrails: a informação vem sempre de um artigo real (#2); o modelo que escreve
(P3) nunca recebe `source.text` — é a mudança estrutural que torna o plágio
improvável em vez de proibido, não apenas uma instrução (docs/publicador/PROMPTS.md
§0); atribuição sempre gravada estruturadamente; o resultado termina SEMPRE em
pending_review (#1).
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from ..config import settings
from ..db import supabase
from ..exceptions import TopicRejected
from ..llm import UsageTracker, complete_json
from ..log import log_error
from ..prompts import render
from ..settings_store import DEFAULT_EDITORIAL_PIPELINE, get_settings, settings_dict
from .brief import EditorialBrief, editorial_brief
from .entities import entities_from_facts
from .facts import FactSheet, extract_facts
from .originality import OriginalityReport, check as check_originality
from .self_audit import AuditResult, rewrite_flagged, self_audit
from .source_article import fetch_source_article, mock_source_article

_STRICT = ConfigDict(extra="forbid")

Desk = Literal["resultados", "transferencias", "analise", "institucional"]

# docs/publicador/AUTHORS.md §3
DESK_BY_TIPO: dict[str, Desk] = {
    "jogo": "resultados",
    "competicao": "resultados",
    "transferencia": "transferencias",
    "lesao": "analise",
    "declaracao": "analise",
    "institucional": "institucional",
    "outro": "analise",
}

DEFAULT_AUTHORS = {
    "byline": "Redação footballtrend",
    "editor": "TODO: o teu nome",
    "ai_assisted": True,
    "desks": {
        "resultados": {"beat": "Jogos e classificações", "voice": "rápida, factual, cronológica. Frases curtas. O resultado no lead, sempre."},
        "transferencias": {"beat": "Mercado", "voice": "cautelosa e explícita sobre o grau de confirmação — distingue sempre acordado, em negociação e noticiado por."},
        "analise": {"beat": "Contexto e leitura", "voice": "mais pausada, com parágrafos ligeiramente maiores, argumenta a partir dos factos da ficha."},
        "institucional": {"beat": "Clubes, federações, regulamentos", "voice": "sóbria, quase administrativa. Cita documentos e comunicados pelo nome."},
    },
}

DEFAULT_VOICE = {
    "variant": "pt-PT",
    "cliche_blacklist": [
        "numa reviravolta", "vale a pena notar", "não é segredo que", "no mundo do futebol",
        "sem sombra de dúvidas", "deu que falar", "fez história", "o astro", "o craque maior",
        "eis o que sabemos", "confira", "saiba mais", "fique atento", "prepare-se",
        "o cenário é claro", "resta saber", "uma coisa é certa", "mexeu com as redes sociais",
        "bombou", "a internet não perdoou", "um golo que vale mais do que três pontos",
    ],
}

DEFAULT_CONTROLLED_TAGS = [
    "futebol", "liga dos campeões", "liga europa", "premier league", "moçambola",
    "transferências", "mercado", "seleção", "lesão", "arbitragem",
]

DEFAULT_ORIGINALITY_THRESHOLDS = {
    "longest_common_run": {"pass": 7, "block": 11},
    "containment_5": {"pass": 0.04, "block": 0.09},
    "jaccard_5": {"pass": 0.06, "block": 0.12},
    "sentence_overlap": {"pass": 0.10, "block": 0.20},
    "title_overlap": {"pass": 0.50, "block": 0.65},
    "self_similarity": {"pass": 0.06, "block": 0.12},
    "word_count": {"pass": 600, "block": 500},
}


class GenerationError(RuntimeError):
    pass


def _settings_dict(cfg: dict[str, Any], key: str, default: dict) -> dict:
    """Um settings mal formado (ex.: veio de uma versão antiga do seed, ou foi
    editado à mão de forma errada) nunca deve rebentar uma geração a meio — depois
    de já se ter gasto tempo/dinheiro em chamadas anteriores da cadeia. Cai para o
    valor por omissão e regista, em vez de deixar um AttributeError opaco subir."""
    value = cfg.get(key)
    if isinstance(value, dict):
        return value
    if value is not None:
        log_error("articles", f"settings.{key} tem o formato errado (esperava objeto) — a usar o valor por omissão", value)
    return default


def _settings_list(cfg: dict[str, Any], key: str, default: list) -> list:
    value = cfg.get(key)
    if isinstance(value, list):
        return value
    if value is not None:
        log_error("articles", f"settings.{key} tem o formato errado (esperava lista) — a usar o valor por omissão", value)
    return default


# ----------------------------------------------------------------------------
# P3 — write_article. Assinatura sem `source_text` de propósito: estruturalmente
# impossível de passar a prosa original, não é só uma instrução no prompt.
# ----------------------------------------------------------------------------

class TraceEntry(BaseModel):
    model_config = _STRICT
    paragrafo: int
    factos: list[str] = Field(default_factory=list)


class WriteResult(BaseModel):
    model_config = _STRICT
    body: str
    trace: list[TraceEntry] = Field(default_factory=list)
    afirmacoes_de_contexto: list[str] = Field(default_factory=list)
    palavras: int


WRITE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "body": {"type": "string"},
        "trace": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "paragrafo": {"type": "integer"},
                    "factos": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["paragrafo", "factos"],
                "additionalProperties": False,
            },
        },
        "afirmacoes_de_contexto": {"type": "array", "items": {"type": "string"}},
        "palavras": {"type": "integer"},
    },
    "required": ["body", "trace", "afirmacoes_de_contexto", "palavras"],
    "additionalProperties": False,
}


async def write_article(
    facts: FactSheet,
    brief: EditorialBrief,
    *,
    byline: str,
    site_name: str,
    voice_variant: str,
    author_persona: str,
    cliches: list[str],
    tracker: UsageTracker,
) -> WriteResult:
    system = render(
        "write_article",
        "system",
        author_name=byline,
        site_name=site_name,
        voice_variant=voice_variant,
        cliche_blacklist="\n".join(f"- {c}" for c in cliches),
    )
    user = render(
        "write_article",
        "user",
        facts_json=facts.model_dump_json(),
        brief_json=brief.model_dump_json(),
        author_persona=author_persona,
    )
    data = await complete_json(
        system=system,
        prompt=user,
        schema=WRITE_SCHEMA,
        max_tokens=6144,
        step="write_article",
        tracker=tracker,
    )
    return WriteResult.model_validate(data)


# ----------------------------------------------------------------------------
# P4 — package
# ----------------------------------------------------------------------------

class PackageResult(BaseModel):
    model_config = _STRICT
    titulo: str
    alternativas: list[str] = Field(default_factory=list)
    dek: str
    seo_description: str
    tags: list[str] = Field(default_factory=list)
    slug: str


PACKAGE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "titulo": {"type": "string"},
        "alternativas": {"type": "array", "items": {"type": "string"}},
        "dek": {"type": "string"},
        "seo_description": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "slug": {"type": "string"},
    },
    "required": ["titulo", "alternativas", "dek", "seo_description", "tags", "slug"],
    "additionalProperties": False,
}


async def package(
    body: str,
    *,
    promessa_titulo: str,
    source_title: str,
    recent_titles: list[str],
    controlled_tags: list[str],
    tracker: UsageTracker,
) -> PackageResult:
    system = render("package", "system")
    user = render(
        "package",
        "user",
        body=body[:4000],
        promessa_titulo=promessa_titulo,
        source_title=source_title,
        recent_titles=json.dumps(recent_titles, ensure_ascii=False),
        controlled_tags=json.dumps(controlled_tags, ensure_ascii=False),
    )
    data = await complete_json(
        system=system,
        prompt=user,
        schema=PACKAGE_SCHEMA,
        max_tokens=1024,
        step="package",
        tracker=tracker,
    )
    return PackageResult.model_validate(data)


# ----------------------------------------------------------------------------
# Helpers de contexto
# ----------------------------------------------------------------------------

async def _recent_titles(limit: int = 10) -> list[str]:
    res = supabase.table("content_items").select("title").order("created_at", desc=True).limit(limit).execute()
    return [r["title"] for r in (res.data or []) if r.get("title")]


async def _recent_bodies_last_72h(limit: int = 20) -> list[str]:
    cutoff = _iso_hours_ago(72)
    res = (
        supabase.table("content_items")
        .select("body, created_at")
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [r["body"] for r in (res.data or []) if r.get("body")]


def _iso_hours_ago(hours: int) -> str:
    import datetime

    return (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)).isoformat()


# P6 (rewrite_flagged) só sabe corrigir passagens copiadas/inventadas — não ajuda
# nada se o bloqueio for por estrutura em falta ou artigo curto demais (isso exige
# reescrever tudo, não só os trechos assinalados).
_SIMILARITY_REASON_KEYS = {
    "longest_common_run", "containment_5", "jaccard_5", "sentence_overlap",
    "title_overlap", "self_similarity", "unauthorized_quotes",
}


def _rewrite_can_help(report: OriginalityReport) -> bool:
    reason_keys = {r.split("=")[0] for r in report.reasons}
    return bool(reason_keys & _SIMILARITY_REASON_KEYS)


def _flagged_from(report: OriginalityReport, audit: AuditResult | None) -> dict[str, Any]:
    flagged: dict[str, Any] = {"frases_proximas_da_fonte": report.flagged_spans}
    if audit:
        flagged["copiado"] = [c.model_dump() for c in audit.copiado]
        flagged["inventado"] = [i.model_dump() for i in audit.inventado]
    return flagged


# ----------------------------------------------------------------------------
# Orquestrador
# ----------------------------------------------------------------------------

async def generate_article(topic: dict[str, Any], tracker: UsageTracker) -> str:
    topic_id, term = topic["id"], topic["term"]
    link = (topic.get("raw_data") or {}).get("link")
    if not link:
        raise GenerationError(f"topic {topic_id} sem link de artigo-fonte em raw_data")

    # guarda contra duplicados: a mesma notícia pode chegar como topics
    # diferentes (RSS relista com título ligeiramente distinto entre polls —
    # topics_daily_uniq dedupe por termo, não pela fonte real). Verificação
    # barata, antes de qualquer custo de rede/LLM — nunca gerar um segundo
    # artigo para a mesma fonte enquanto o primeiro está pendente ou publicado.
    # Ver também o índice único em content_items (mesma verificação, mas
    # imposta na BD, para a janela de corrida entre dois topics distintos
    # gerados ao mesmo tempo).
    dup = (
        supabase.table("content_items")
        .select("id")
        .eq("metadata->>source_url", link)
        .in_("status", ["pending_review", "published"])
        .limit(1)
        .execute()
    )
    if dup.data:
        raise TopicRejected(f"já existe um artigo para esta fonte: {link}")

    # settings primeiro, antes de gastar tempo/dinheiro em rede/LLM — um valor mal
    # formado cai para o omisso (ver _settings_dict/_settings_list), nunca rebenta.
    cfg = get_settings(["authors", "editorial_voice", "controlled_tags", "originality_thresholds", "editorial_pipeline"])
    authors_cfg = _settings_dict(cfg, "authors", DEFAULT_AUTHORS)
    voice_cfg = _settings_dict(cfg, "editorial_voice", DEFAULT_VOICE)
    controlled_tags = _settings_list(cfg, "controlled_tags", DEFAULT_CONTROLLED_TAGS)
    thresholds = _settings_dict(cfg, "originality_thresholds", DEFAULT_ORIGINALITY_THRESHOLDS)
    pipeline = settings_dict(cfg, "editorial_pipeline", DEFAULT_EDITORIAL_PIPELINE)
    strictness = pipeline.get("audit_strictness") or "normal"

    # 1. Artigo real de uma fonte configurada (guardrail #2)
    source = mock_source_article(link) if settings.allow_mock_facts else fetch_source_article(link)

    facts_res = (
        supabase.table("sport_facts")
        .insert(
            {
                "topic_id": topic_id,
                "provider": source.site_name,
                "data": {"title": source.title, "text": source.text},
                "source_url": source.url,
            }
        )
        .execute()
    )
    if not facts_res.data:
        raise GenerationError("Falha a gravar sport_facts")
    sport_facts_id = facts_res.data[0]["id"]

    # P1 — pode levantar TopicRejected (fonte sem substância)
    facts = await extract_facts(source, tracker)
    supabase.table("sport_facts").update(
        {"data": {"title": source.title, "text": source.text, "facts": facts.model_dump()}}
    ).eq("id", sport_facts_id).execute()

    desk = DESK_BY_TIPO.get(facts.tipo, "analise")
    desk_cfg = authors_cfg.get("desks") or {}
    desk_cfg = desk_cfg.get(desk, {}) if isinstance(desk_cfg, dict) else {}
    byline = authors_cfg.get("byline", DEFAULT_AUTHORS["byline"])

    # P2 — pode levantar TopicRejected (peça inviável)
    brief = await editorial_brief(
        facts,
        author_name=desk,
        author_beat=desk_cfg.get("beat", ""),
        voice_variant=voice_cfg.get("variant", "pt-PT"),
        tracker=tracker,
    )

    # P3 — NUNCA recebe source.text
    write_result = await write_article(
        facts,
        brief,
        byline=byline,
        site_name="footballtrend",
        voice_variant=voice_cfg.get("variant", "pt-PT"),
        author_persona=desk_cfg.get("voice", ""),
        cliches=voice_cfg.get("cliche_blacklist", DEFAULT_VOICE["cliche_blacklist"]),
        tracker=tracker,
    )
    body = write_result.body

    # Portão determinístico (grátis, sem LLM) + auditoria (P5) + reescrita dirigida (P6)
    entities = entities_from_facts(facts)
    # a tradução de cada citação também é autorizada — é a que o artigo usa
    allowed_quotes = [q for c in facts.citacoes for q in (c.texto, c.traducao) if q]
    recent_bodies = await _recent_bodies_last_72h()

    report = check_originality(
        body,
        source.text,
        source.title or term,
        entities=entities,
        allowed_quotes=allowed_quotes,
        recent_bodies=recent_bodies,
        thresholds=thresholds,
    )

    audit: AuditResult | None = None
    if report.verdict != "block":
        audit = await self_audit(body, source.text, facts, tracker, strictness)

    # "rever" também passa pela reescrita dirigida quando o painel o pede
    # (editorial_pipeline.rewrite_on_audit_review): sem isto, os casos menores
    # que o auditor aponta (frase traduzida à letra, citação deixada em inglês)
    # ficavam no artigo e o piloto nunca o podia publicar.
    audit_rewrite_verdicts = {"bloquear", "rever"} if pipeline.get("rewrite_on_audit_review") else {"bloquear"}
    audit_wants_rewrite = audit is not None and audit.veredicto in audit_rewrite_verdicts
    if report.verdict == "block" or audit_wants_rewrite:
        if report.verdict == "block" and not _rewrite_can_help(report) and not audit_wants_rewrite:
            # estrutura em falta ou artigo curto demais — reescrever só os trechos
            # assinalados (P6) não resolve isto; mais vale falhar já e deixar o
            # scheduler tentar de novo do zero (P3 novo) do que gastar mais uma
            # chamada ao LLM numa correção que não se aplica ao problema.
            raise GenerationError(
                f"bloqueado por estrutura/comprimento, não por semelhança com a fonte: {report.reasons}"
            )
        flagged = _flagged_from(report, audit)
        body = await rewrite_flagged(body, flagged, facts, tracker)
        report = check_originality(
            body,
            source.text,
            source.title or term,
            entities=entities,
            allowed_quotes=allowed_quotes,
            recent_bodies=recent_bodies,
            thresholds=thresholds,
        )
        if report.verdict == "block":
            raise GenerationError(f"bloqueado pelo portão de originalidade após reescrita: {report.reasons}")
        audit = await self_audit(body, source.text, facts, tracker, strictness)
        if audit.veredicto == "bloquear":
            raise GenerationError(f"bloqueado pela auditoria após reescrita: {audit.resumo}")

    # P4
    recent_titles = await _recent_titles()
    pkg = await package(
        body,
        promessa_titulo=brief.promessa_titulo,
        source_title=source.title or term,
        recent_titles=recent_titles,
        controlled_tags=controlled_tags,
        tracker=tracker,
    )

    # Criar a peça — SEMPRE pending_review (guardrail #1). Atribuição gravada
    # diretamente (não depende do LLM — guardrail de honestidade).
    # O índice único em (metadata->>source_url) apanha aqui a corrida rara
    # entre dois topics DIFERENTES da mesma fonte gerados em paralelo — o
    # dup-check lá em cima já evita o caso comum, isto é só o backstop.
    try:
        item_res = (
            supabase.table("content_items")
            .insert(
                {
                    "topic_id": topic_id,
                    "status": "pending_review",
                    "title": pkg.titulo,
                    "body": body,
                    "author": {
                        "byline": byline,
                        "desk": desk,
                        "editor": authors_cfg.get("editor", DEFAULT_AUTHORS["editor"]),
                        "ai_assisted": authors_cfg.get("ai_assisted", True),
                    },
                    "media_url": source.image_url,
                    "metadata": {
                        "dek": pkg.dek,
                        "seo_description": pkg.seo_description,
                        "tags": pkg.tags,
                        "slug": pkg.slug,
                        "alternativas": pkg.alternativas,
                        "variation": brief.variacao,
                        "desk": desk,
                        "trace": [t.model_dump() for t in write_result.trace],
                        "afirmacoes_de_contexto": write_result.afirmacoes_de_contexto,
                        "originality": report.as_metadata(),
                        "self_audit": audit.model_dump() if audit else None,
                        "source_name": source.site_name,
                        "source_url": source.url,
                        "prompt_version": "publicador-v1",
                    },
                }
            )
            .execute()
        )
    except Exception as err:
        if "23505" in str(err):
            raise TopicRejected(f"já existe um artigo para esta fonte (corrida entre topics): {link}") from err
        raise

    if not item_res.data:
        raise GenerationError("Falha a criar content_item")

    return item_res.data[0]["id"]
