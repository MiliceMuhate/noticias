"""
P5 self_audit + P6 rewrite_flagged (docs/publicador/PROMPTS.md).
self_audit é o único passo que vê o artigo original — o trabalho aqui é comparar,
depois do portão determinístico (originality.py) já ter corrido.
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..llm import UsageTracker, complete_json
from ..prompts import render
from .facts import FactSheet

Veredicto = Literal["aprovado", "rever", "bloquear"]

_STRICT = ConfigDict(extra="forbid")


class Copiado(BaseModel):
    model_config = _STRICT
    artigo: str
    original: str
    palavras: int


class Inventado(BaseModel):
    model_config = _STRICT
    trecho: str
    porque: str


class Decalcado(BaseModel):
    model_config = _STRICT
    sim: bool
    explicacao: str


class AuditResult(BaseModel):
    model_config = _STRICT
    copiado: list[Copiado] = Field(default_factory=list)
    inventado: list[Inventado] = Field(default_factory=list)
    decalcado: Decalcado
    veredicto: Veredicto
    resumo: str


AUDIT_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "copiado": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "artigo": {"type": "string"},
                    "original": {"type": "string"},
                    "palavras": {"type": "integer"},
                },
                "required": ["artigo", "original", "palavras"],
                "additionalProperties": False,
            },
        },
        "inventado": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"trecho": {"type": "string"}, "porque": {"type": "string"}},
                "required": ["trecho", "porque"],
                "additionalProperties": False,
            },
        },
        "decalcado": {
            "type": "object",
            "properties": {"sim": {"type": "boolean"}, "explicacao": {"type": "string"}},
            "required": ["sim", "explicacao"],
            "additionalProperties": False,
        },
        "veredicto": {"type": "string", "enum": ["aprovado", "rever", "bloquear"]},
        "resumo": {"type": "string"},
    },
    "required": ["copiado", "inventado", "decalcado", "veredicto", "resumo"],
    "additionalProperties": False,
}

REWRITE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "body": {"type": "string"},
        "alteracoes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["body", "alteracoes"],
    "additionalProperties": False,
}


# settings.editorial_pipeline.audit_strictness (painel → Configuração → Motor
# editorial). Muda só a fronteira entre "aprovado" e "rever"; "bloquear" é
# sempre cópia/invenção grave, em qualquer nível.
STRICTNESS_GUIDANCE: dict[str, str] = {
    "tolerante": (
        "Rigor: TOLERANTE. Uma frase isolada próxima do original, ou uma afirmação "
        "interpretativa discutível, não chega para \"rever\" — usa \"aprovado\". Só "
        "\"rever\" com 3 ou mais casos, ou com um facto específico errado."
    ),
    "normal": "Rigor: NORMAL. Aplica os critérios acima tal como estão escritos.",
    "rigoroso": (
        "Rigor: RIGOROSO. Qualquer caso de copiado, inventado ou decalcado, por menor "
        "que seja, dá \"rever\". Citações deixadas na língua original contam como copiado."
    ),
}


async def self_audit(
    body: str, source_text: str, facts: FactSheet, tracker: UsageTracker, strictness: str = "normal"
) -> AuditResult:
    system = render("self_audit", "system")
    user = render(
        "self_audit",
        "user",
        body=body,
        source_text=source_text[:8000],
        facts_json=facts.model_dump_json(),
        strictness=STRICTNESS_GUIDANCE.get(strictness, STRICTNESS_GUIDANCE["normal"]),
    )
    data = await complete_json(
        system=system,
        prompt=user,
        schema=AUDIT_SCHEMA,
        max_tokens=2048,
        step="self_audit",
        tracker=tracker,
    )
    return AuditResult.model_validate(data)


async def rewrite_flagged(body: str, flagged: dict, facts: FactSheet, tracker: UsageTracker) -> str:
    system = render("rewrite_flagged", "system")
    user = render(
        "rewrite_flagged",
        "user",
        body=body,
        flagged_json=json.dumps(flagged, ensure_ascii=False),
        facts_json=facts.model_dump_json(),
    )
    data = await complete_json(
        system=system,
        prompt=user,
        schema=REWRITE_SCHEMA,
        max_tokens=4096,
        step="rewrite_flagged",
        tracker=tracker,
    )
    return data["body"]
