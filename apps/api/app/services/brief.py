"""P2 — editorial_brief (docs/publicador/PROMPTS.md)."""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..db import supabase
from ..exceptions import TopicRejected
from ..llm import UsageTracker, complete_json
from ..prompts import render
from ..settings_store import model_for_step
from .facts import FactSheet

Variacao = Literal[
    "os_numeros", "cronologia", "as_declaracoes", "as_pecas", "o_precedente", "o_impacto_tatico", "as_contas"
]

_STRICT = ConfigDict(extra="forbid")


class Seccao(BaseModel):
    model_config = _STRICT
    seccao: str
    funcao: str
    factos: list[str] = Field(default_factory=list)
    palavras: int


class EditorialBrief(BaseModel):
    model_config = _STRICT
    viavel: bool
    motivo_se_inviavel: str | None
    angulo: str
    promessa_titulo: str
    variacao: Variacao
    estrutura: list[Seccao]
    contexto_a_acrescentar: list[str] = Field(default_factory=list)
    perguntas_em_aberto: list[str] = Field(default_factory=list)
    nao_incluir: list[str] = Field(default_factory=list)


BRIEF_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "viavel": {"type": "boolean"},
        "motivo_se_inviavel": {"type": ["string", "null"]},
        "angulo": {"type": "string"},
        "promessa_titulo": {"type": "string"},
        "variacao": {"type": "string", "enum": list(Variacao.__args__)},
        "estrutura": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "seccao": {"type": "string"},
                    "funcao": {"type": "string"},
                    "factos": {"type": "array", "items": {"type": "string"}},
                    "palavras": {"type": "integer"},
                },
                "required": ["seccao", "funcao", "factos", "palavras"],
                "additionalProperties": False,
            },
        },
        "contexto_a_acrescentar": {"type": "array", "items": {"type": "string"}},
        "perguntas_em_aberto": {"type": "array", "items": {"type": "string"}},
        "nao_incluir": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "viavel",
        "motivo_se_inviavel",
        "angulo",
        "promessa_titulo",
        "variacao",
        "estrutura",
        "contexto_a_acrescentar",
        "perguntas_em_aberto",
        "nao_incluir",
    ],
    "additionalProperties": False,
}

# extrato de docs/publicador/EDITORIAL.md §3-4 — estrutura obrigatória e vocabulário
# fechado de variação, injetado no prompt (não o manual inteiro)
EDITORIAL_STRUCTURE_SUMMARY = """\
Estrutura obrigatória: Lead (2-3 frases) -> "O que aconteceu" (factos, 2-4 parágrafos)
-> bloco de variação (um dos sete abaixo) -> "Porque é que isto importa" [ORIGINAL,
nunca da fonte] -> "O que vem a seguir" [ORIGINAL, nunca da fonte].

Variações (escolhe uma, não repitas as 3 anteriores do mesmo autor):
- os_numeros: há estatísticas na ficha -> lista de 3-5 números com o que significam
- cronologia: processo arrastado -> linha temporal datada
- as_declaracoes: há citações na ficha -> citação curta + o que ela revela
- as_pecas: várias entidades -> quem é quem e o que cada um quer
- o_precedente: situação com paralelo conhecido -> caso anterior comparável
- o_impacto_tatico: jogo ou treinador -> o que muda em campo, sem inventar esquemas
- as_contas: valores/salários/cláusulas -> o dinheiro explicado em partes
"""


async def _recent_titles(limit: int = 10) -> list[str]:
    res = (
        supabase.table("content_items")
        .select("title")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [r["title"] for r in (res.data or []) if r.get("title")]


async def _recent_variations(desk: str, limit: int = 3) -> list[str]:
    # metadata.desk (não `author` — que passou a ser um objeto {byline,desk,editor,...},
    # ver docs/publicador/AUTHORS.md §1). "do mesmo autor" no documento corresponde,
    # nesta arquitetura de autoria transparente, a "da mesma editoria".
    res = (
        supabase.table("content_items")
        .select("metadata")
        .filter("metadata->>desk", "eq", desk)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    variations = []
    for row in res.data or []:
        v = (row.get("metadata") or {}).get("variation")
        if v:
            variations.append(v)
    return variations


async def editorial_brief(
    facts: FactSheet, *, author_name: str, author_beat: str, voice_variant: str, tracker: UsageTracker
) -> EditorialBrief:
    """`author_name` aqui é o desk (ex.: 'resultados') — ver nota em `_recent_variations`."""
    recent_titles = await _recent_titles()
    recent_variations = await _recent_variations(author_name)

    system = render("editorial_brief", "system")
    user = render(
        "editorial_brief",
        "user",
        facts_json=facts.model_dump_json(),
        editorial_structure_and_variations=EDITORIAL_STRUCTURE_SUMMARY,
        recent_titles=json.dumps(recent_titles, ensure_ascii=False),
        recent_variations=json.dumps(recent_variations, ensure_ascii=False),
        author_name=author_name,
        author_beat=author_beat,
        voice_variant=voice_variant,
    )
    data = await complete_json(
        system=system,
        prompt=user,
        schema=BRIEF_SCHEMA,
        max_tokens=2048,
        model=model_for_step("editorial_brief"),
        tracker=tracker,
    )
    brief = EditorialBrief.model_validate(data)

    if not brief.viavel:
        raise TopicRejected(brief.motivo_se_inviavel or "editor considerou a peça inviável")

    return brief
