"""
Pontuação de topics: score = relevance*w1 + momentum*w2 + volume*w3
(pesos de settings.scoring_weights, todos os fatores normalizados 0..1).
Abaixo de settings.score_threshold → 'rejected'. Caso contrário → 'scored', e se
settings.auto_approve_gen permitir → 'approved_for_gen'.
"""

from __future__ import annotations

import math
from typing import Any

MOMENTUM_FACTOR: dict[str, float] = {"rising": 1.0, "peaked": 0.6, "falling": 0.2}


def relevance_score(term: str, category: str | None, keywords: list[str]) -> float:
    """relevância ao nicho: fração de keywords presentes no termo/categoria"""
    if not keywords:
        return 0.5  # sem keywords configuradas → neutro
    haystack = f"{term} {category or ''}".lower()
    hits = sum(1 for k in keywords if k.lower() in haystack)
    if hits == 0:
        return 0.1
    return min(1.0, 0.5 + hits * 0.25)


def volume_score(raw_data: Any) -> float:
    """volume normalizado com log10 (100 → ~0.33, 10k → ~0.66, 1M → 1.0)"""
    volume = raw_data.get("search_volume") if isinstance(raw_data, dict) else None
    if not isinstance(volume, (int, float)) or volume <= 0:
        return 0.3  # desconhecido → conservador
    return min(1.0, math.log10(volume) / 6)


def score_topic(
    *,
    term: str,
    category: str | None,
    momentum: str | None,
    raw_data: Any,
    keywords: list[str],
    weights: dict[str, float],
) -> float:
    relevance = relevance_score(term, category, keywords)
    momentum_factor = MOMENTUM_FACTOR.get(momentum or "rising", 0.5)
    volume = volume_score(raw_data)
    score = relevance * weights["relevance"] + momentum_factor * weights["momentum"] + volume * weights["volume"]
    return round(score, 4)
