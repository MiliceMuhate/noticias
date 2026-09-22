"""Leitura da tabela `settings` (BD) — partilhado por scheduler.py e pelos serviços
editoriais, para poder afinar vozes/limiares/modelos sem novo deploy."""

from __future__ import annotations

from typing import Any

from .config import settings as env_settings
from .db import supabase


def get_settings(keys: list[str]) -> dict[str, Any]:
    res = supabase.table("settings").select("*").in_("key", keys).execute()
    return {row["key"]: row["value"] for row in (res.data or [])}


def model_for_step(step: str) -> str:
    """settings.model_by_step[step], com fallback ao modelo único do .env."""
    cfg = get_settings(["model_by_step"])
    by_step = cfg.get("model_by_step") or {}
    return by_step.get(step) or env_settings.anthropic_model
