"""Leitura da tabela `settings` (BD) — partilhado por scheduler.py e pelos serviços
editoriais, para poder afinar vozes/limiares/modelos sem novo deploy.
(O modelo/provedor por passo resolve-se em llm.resolve_step.)"""

from __future__ import annotations

from typing import Any

from .db import supabase


def get_settings(keys: list[str]) -> dict[str, Any]:
    res = supabase.table("settings").select("*").in_("key", keys).execute()
    return {row["key"]: row["value"] for row in (res.data or [])}


def settings_dict(cfg: dict[str, Any], key: str, default: dict) -> dict:
    """Valor de settings como objeto, com os campos em falta preenchidos pelo
    omisso — um settings antigo/mal formado nunca rebenta um ciclo."""
    value = cfg.get(key)
    return {**default, **value} if isinstance(value, dict) else dict(default)


DEFAULT_AUTOPILOT_POLICY = {"min_originality": "pass", "min_audit": "aprovado"}
DEFAULT_EDITORIAL_PIPELINE = {"rewrite_on_audit_review": True, "audit_strictness": "normal"}
DEFAULT_TRANSLATION = {"enabled": True, "languages": ["en", "es", "fr"], "max_attempts": 3}
