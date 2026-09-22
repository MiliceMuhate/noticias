"""
Requisito crítico de docs/publicador/PROMPTS.md (Prompt 2): a chamada de
write_article não pode receber o texto original do artigo-fonte em lado nenhum do
contexto. Intercepta o payload enviado à API (via monkeypatch de app.llm) e falha
se encontrar qualquer sequência de 8 palavras do texto original.
"""

from __future__ import annotations

import re

import pytest

from app.llm import UsageTracker
from app.services.articles import write_article
from app.services.brief import EditorialBrief, Seccao
from app.services.facts import Entidades, Fact, FactSheet

# Texto que NUNCA deve chegar ao prompt de write_article — palavra-passe
# deliberadamente inconfundível, para o teste não dar falso positivo por coincidência.
FORBIDDEN_SOURCE_TEXT = (
    "O correspondente relatou que o guarda-redes titular sofreu uma lesão muscular "
    "grave durante o aquecimento e por isso não vai representar a seleção nacional "
    "no torneio internacional do próximo verão, segundo revelou um comunicado oficial "
    "do departamento médico do clube esta manhã em conferência de imprensa."
)


def _eight_word_runs(text: str) -> set[str]:
    words = re.findall(r"\w+", text.lower())
    return {" ".join(words[i : i + 8]) for i in range(len(words) - 7)}


FACTS = FactSheet(
    evento="Equipa vence jogo em casa",
    tipo="jogo",
    quando="ontem",
    entidades=Entidades(clubes=["Clube A", "Clube B"], pessoas=[], competicoes=["Liga X"]),
    factos=[Fact(id="F1", nota="Clube A venceu 2-0", tipo="resultado", certeza="confirmado")],
    numeros=[],
    citacoes=[],
    lacunas=[],
    densidade="alta",
)

BRIEF = EditorialBrief(
    viavel=True,
    motivo_se_inviavel=None,
    angulo="O que este resultado muda na classificação",
    promessa_titulo="Clube A vence e sobe na tabela",
    variacao="os_numeros",
    estrutura=[Seccao(seccao="lead", funcao="abrir", factos=["F1"], palavras=50)],
    contexto_a_acrescentar=[],
    perguntas_em_aberto=[],
    nao_incluir=[],
)


@pytest.mark.asyncio
async def test_write_article_never_sees_source(monkeypatch):
    captured: dict[str, str] = {}

    async def fake_complete_json(*, system: str, prompt: str, **kwargs):
        captured["system"] = system
        captured["prompt"] = prompt
        return {
            "body": "## O que aconteceu\n\nTexto de teste.",
            "trace": [],
            "afirmacoes_de_contexto": [],
            "palavras": 5,
        }

    monkeypatch.setattr("app.services.articles.complete_json", fake_complete_json)

    await write_article(
        FACTS,
        BRIEF,
        byline="Redação Teste",
        site_name="Site Teste",
        voice_variant="pt-PT",
        author_persona="voz neutra",
        cliches=["clichê de teste"],
        tracker=UsageTracker(),
    )

    payload = captured["system"] + "\n" + captured["prompt"]
    assert FORBIDDEN_SOURCE_TEXT not in payload

    forbidden_runs = _eight_word_runs(FORBIDDEN_SOURCE_TEXT)
    payload_runs = _eight_word_runs(payload)
    overlap = forbidden_runs & payload_runs
    assert not overlap, f"write_article viu texto da fonte: {overlap}"


def test_write_article_signature_has_no_source_text_param():
    """Garantia estrutural, não só de teste: a função nem aceita o parâmetro."""
    import inspect

    params = set(inspect.signature(write_article).parameters)
    assert "source_text" not in params
    assert "source" not in params
