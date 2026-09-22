"""
Carrega os prompts de `app/prompts/*.md` — nunca embutidos em f-strings no código
(ver docs/publicador/PROMPTS.md). Placeholders usam `{{chave}}` (duplo, para nunca
colidir com chavetas de exemplos JSON dentro dos próprios prompts).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).parent / "prompts"


@lru_cache(maxsize=None)
def _read(filename: str) -> str:
    return (_DIR / filename).read_text(encoding="utf-8")


def render(step: str, role: str, **values: str) -> str:
    """render('extract_facts', 'system') ou render('extract_facts', 'user', source_text=...)"""
    template = _read(f"{step}.{role}.md")
    for key, value in values.items():
        template = template.replace(f"{{{{{key}}}}}", str(value))
    return template
