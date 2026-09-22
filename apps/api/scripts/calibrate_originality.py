"""
Prompt 7 (docs/publicador/TASKS_CONTENT.md): corre originality.check sobre os
content_items existentes e imprime as métricas + percentis, para comparar o
veredicto automático com leitura humana e ajustar settings.originality_thresholds
com dados em vez de palpites. NÃO altera a base de dados.

Uso: python scripts/calibrate_originality.py
"""

from __future__ import annotations

import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db import supabase  # noqa: E402
from app.services.entities import entities_from_facts  # noqa: E402
from app.services.facts import FactSheet  # noqa: E402
from app.services.originality import check  # noqa: E402
from app.services.articles import DEFAULT_ORIGINALITY_THRESHOLDS  # noqa: E402

METRICS = [
    "longest_common_run", "containment_5", "jaccard_5", "sentence_overlap",
    "title_overlap", "self_similarity", "word_count",
]


def main() -> None:
    items = (
        supabase.table("content_items")
        .select("id, title, body, topic_id, metadata")
        .not_.is_("body", "null")
        .execute()
        .data
        or []
    )

    rows: list[dict] = []
    for item in items:
        facts_res = (
            supabase.table("sport_facts")
            .select("data")
            .eq("topic_id", item["topic_id"])
            .limit(1)
            .execute()
        )
        if not facts_res.data:
            continue
        data = facts_res.data[0]["data"] or {}
        source_text = data.get("text")
        facts_raw = data.get("facts")
        if not source_text or not facts_raw:
            continue

        try:
            facts = FactSheet.model_validate(facts_raw)
        except Exception:
            continue

        entities = entities_from_facts(facts)
        allowed_quotes = [c.texto for c in facts.citacoes]
        report = check(
            item["body"],
            source_text,
            data.get("title") or "",
            entities=entities,
            allowed_quotes=allowed_quotes,
            recent_bodies=[],
            thresholds=DEFAULT_ORIGINALITY_THRESHOLDS,
        )
        stored_verdict = ((item.get("metadata") or {}).get("originality") or {}).get("verdict")
        rows.append({"id": item["id"], "title": item["title"], "stored_verdict": stored_verdict, "report": report})

    if not rows:
        print("Sem content_items com sport_facts.data.text + facts para calibrar.")
        return

    print(f"{len(rows)} artigos analisados\n")
    header = f"{'id':<38} {'veredicto':<12} {'guardado':<12} " + " ".join(f"{m:<16}" for m in METRICS)
    print(header)
    print("-" * len(header))
    for row in rows:
        r = row["report"]
        values = " ".join(f"{getattr(r, m):<16}" for m in METRICS)
        print(f"{row['id']:<38} {r.verdict:<12} {str(row['stored_verdict']):<12} {values}")

    print("\nPercentis (50/75/90/95):")
    for metric in METRICS:
        values = sorted(getattr(row["report"], metric) for row in rows)
        if not values:
            continue
        percentiles = statistics.quantiles(values, n=100, method="inclusive") if len(values) > 1 else values * 100
        p50 = percentiles[49] if len(values) > 1 else values[0]
        p75 = percentiles[74] if len(values) > 1 else values[0]
        p90 = percentiles[89] if len(values) > 1 else values[0]
        p95 = percentiles[94] if len(values) > 1 else values[0]
        print(f"  {metric:<20} p50={p50}  p75={p75}  p90={p90}  p95={p95}")


if __name__ == "__main__":
    main()
