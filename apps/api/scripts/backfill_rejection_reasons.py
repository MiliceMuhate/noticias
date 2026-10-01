"""
Preenche topics.rejection_category/rejection_reason nas notícias recusadas ou
falhadas ANTES de o motivo passar a ser gravado (migração
20261001000001_topic_rejection_reasons.sql). Usa o último erro do job de cada
notícia, ou a pontuação nas recusadas por pontuação. Sem chamadas à IA.

    cd apps/api && python -m scripts.backfill_rejection_reasons [--dry-run]

Só toca em notícias não arquivadas e ainda sem motivo — pode correr-se mais
de uma vez sem estragar nada.
"""

from __future__ import annotations

import sys

from app.db import supabase
from app.services.rejections import from_editor, from_error, from_score
from app.services.scoring import relevance_score


def main(dry_run: bool) -> None:
    min_score = (
        (supabase.table("settings").select("value").eq("key", "score_threshold").execute().data or [{}])[0]
        .get("value", {})
        .get("min_score", 0.45)
    )
    topics = (
        supabase.table("topics")
        .select("id, term, category, status, score, sources(config), jobs(error, status, created_at)")
        .in_("status", ["rejected", "failed"])
        .is_("archived_at", "null")
        .is_("rejection_category", "null")
        .limit(5000)
        .execute()
        .data
        or []
    )
    counts: dict[str, int] = {}
    for t in topics:
        jobs = sorted((j for j in t.get("jobs") or [] if j.get("error")), key=lambda j: j["created_at"], reverse=True)
        if jobs:
            error = jobs[0]["error"]
            # job 'done' com erro = recusa da redação (TopicRejected); 'failed' = falha
            category, reason = from_editor(error) if jobs[0]["status"] == "done" else from_error(error)
        elif t["status"] == "rejected" and t.get("score") is not None:
            keywords = ((t.get("sources") or {}).get("config") or {}).get("keywords") or []
            category, reason = from_score(t["score"], min_score, keywords, relevance_score(t["term"], t.get("category"), keywords))
        else:
            continue
        counts[category] = counts.get(category, 0) + 1
        if not dry_run:
            supabase.table("topics").update({"rejection_category": category, "rejection_reason": reason}).eq("id", t["id"]).execute()
    print(("[simulação] " if dry_run else "") + f"{sum(counts.values())} de {len(topics)} notícias com motivo:")
    for category, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {n:5}  {category}")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
