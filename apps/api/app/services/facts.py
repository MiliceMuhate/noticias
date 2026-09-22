"""
P1 — extract_facts (docs/publicador/PROMPTS.md). O modelo que escreve o artigo nunca
vê a prosa do artigo original — só esta ficha telegráfica. É a mudança estrutural que
torna o plágio improvável em vez de proibido (docs/publicador/PROMPTS.md §0).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..exceptions import TopicRejected
from ..llm import UsageTracker, complete_json
from ..prompts import render
from ..settings_store import model_for_step
from .source_article import SourceArticle

EventoTipo = Literal["jogo", "transferencia", "lesao", "declaracao", "institucional", "competicao", "outro"]
FactoTipo = Literal["resultado", "numero", "decisao", "declaracao", "calendario", "contexto"]
Papel = Literal["jogador", "treinador", "dirigente", "agente", "arbitro"]
Certeza = Literal["confirmado", "reportado", "aproximado"]
Densidade = Literal["alta", "media", "baixa"]

_STRICT = ConfigDict(extra="forbid")


class Pessoa(BaseModel):
    model_config = _STRICT
    nome: str
    papel: Papel


class Entidades(BaseModel):
    model_config = _STRICT
    clubes: list[str] = Field(default_factory=list)
    pessoas: list[Pessoa] = Field(default_factory=list)
    competicoes: list[str] = Field(default_factory=list)


class Fact(BaseModel):
    model_config = _STRICT
    id: str
    nota: str
    tipo: FactoTipo
    certeza: Certeza


class Numero(BaseModel):
    model_config = _STRICT
    id: str
    valor: str
    significado: str


class Citacao(BaseModel):
    model_config = _STRICT
    id: str
    autor: str
    texto: str


class FactSheet(BaseModel):
    model_config = _STRICT
    evento: str
    tipo: EventoTipo
    quando: str | None
    entidades: Entidades
    factos: list[Fact]
    numeros: list[Numero] = Field(default_factory=list)
    citacoes: list[Citacao] = Field(default_factory=list)
    lacunas: list[str] = Field(default_factory=list)
    densidade: Densidade


# Schema escrito à mão (não Pydantic .model_json_schema(), que gera $ref/$defs para
# modelos aninhados — mais seguro não depender de o proxy resolver referências).
FACT_SHEET_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "evento": {"type": "string"},
        "tipo": {"type": "string", "enum": list(EventoTipo.__args__)},
        "quando": {"type": ["string", "null"]},
        "entidades": {
            "type": "object",
            "properties": {
                "clubes": {"type": "array", "items": {"type": "string"}},
                "pessoas": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "nome": {"type": "string"},
                            "papel": {"type": "string", "enum": list(Papel.__args__)},
                        },
                        "required": ["nome", "papel"],
                        "additionalProperties": False,
                    },
                },
                "competicoes": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["clubes", "pessoas", "competicoes"],
            "additionalProperties": False,
        },
        "factos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "nota": {"type": "string"},
                    "tipo": {"type": "string", "enum": list(FactoTipo.__args__)},
                    "certeza": {"type": "string", "enum": list(Certeza.__args__)},
                },
                "required": ["id", "nota", "tipo", "certeza"],
                "additionalProperties": False,
            },
        },
        "numeros": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "valor": {"type": "string"},
                    "significado": {"type": "string"},
                },
                "required": ["id", "valor", "significado"],
                "additionalProperties": False,
            },
        },
        "citacoes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "autor": {"type": "string"},
                    "texto": {"type": "string"},
                },
                "required": ["id", "autor", "texto"],
                "additionalProperties": False,
            },
        },
        "lacunas": {"type": "array", "items": {"type": "string"}},
        "densidade": {"type": "string", "enum": list(Densidade.__args__)},
    },
    "required": ["evento", "tipo", "quando", "entidades", "factos", "numeros", "citacoes", "lacunas", "densidade"],
    "additionalProperties": False,
}

MIN_FACTS = 4
MAX_NOTE_WORDS = 25


class FactExtractionError(RuntimeError):
    pass


def _violations(sheet: FactSheet) -> list[str]:
    return [f.id for f in sheet.factos if len(f.nota.split()) > MAX_NOTE_WORDS]


async def _call(article: SourceArticle, tracker: UsageTracker) -> FactSheet:
    system = render("extract_facts", "system")
    user = render(
        "extract_facts",
        "user",
        provider=article.site_name,
        source_url=article.url,
        title=article.title or "",
        source_text=article.text[:8000],
    )
    data = await complete_json(
        system=system,
        prompt=user,
        schema=FACT_SHEET_SCHEMA,
        max_tokens=2048,
        model=model_for_step("extract_facts"),
        tracker=tracker,
    )
    try:
        return FactSheet.model_validate(data)
    except Exception as err:
        raise FactExtractionError(f"ficha de factos inválida: {err}") from err


async def extract_facts(article: SourceArticle, tracker: UsageTracker) -> FactSheet:
    sheet = await _call(article, tracker)

    if _violations(sheet):
        # uma nota longa demais — repete uma vez, depois desiste (a chamada acima
        # já é o pedido "normal"; isto é só uma segunda tentativa, não um loop)
        sheet = await _call(article, tracker)
        if _violations(sheet):
            raise FactExtractionError(f"notas acima de {MAX_NOTE_WORDS} palavras mesmo após repetição")

    if len(sheet.factos) < MIN_FACTS or sheet.densidade == "baixa":
        raise TopicRejected(
            f"fonte sem substância: {len(sheet.factos)} factos, densidade={sheet.densidade}"
        )

    return sheet
