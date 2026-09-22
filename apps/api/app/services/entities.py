"""
Conjunto de exceções para o portão de originalidade (docs/publicador/ORIGINALITY.md
§2 "Exceções que não contam como sobreposição") — nomes próprios e expressões fixas
do domínio, para o `longest_common_run` não disparar em "Liga dos Campeões da UEFA".
"""

from __future__ import annotations

from .facts import FactSheet
from .originality import tokens

FIXED_DOMAIN_EXPRESSIONS = [
    "grande penalidade",
    "tempo de compensação",
    "cartão amarelo",
    "cartão vermelho",
    "fase de grupos",
    "janela de transferências",
    "liga dos campeões",
    "liga europa",
    "fora de jogo",
]


def entities_from_facts(facts: FactSheet) -> set[str]:
    names: list[str] = [*facts.entidades.clubes, *facts.entidades.competicoes]
    names += [p.nome for p in facts.entidades.pessoas]

    entity_tokens: set[str] = set()
    for name in names:
        entity_tokens.update(tokens(name))
    for phrase in FIXED_DOMAIN_EXPRESSIONS:
        entity_tokens.update(tokens(phrase))
    return entity_tokens
