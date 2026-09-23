"""
Preenche `content_items.media_url` para peças já geradas sem imagem — a extração
de imagem da fonte (`source_article.fetch_source_article`) por vezes falha de
forma intermitente mesmo quando o texto é extraído com sucesso (ver ARCHITECTURE.md).
Não inventa nada: só tenta de novo a mesma extração hotlinked na mesma
`metadata.source_url` já gravada. Idempotente — corre quantas vezes quiseres.

Uso: python scripts/backfill_media_url.py [--apply]
Sem --apply, só reporta o que encontraria (dry-run).
"""

from __future__ import annotations

import sys

from app.db import supabase
from app.services.source_article import fetch_source_article


def main() -> None:
    apply = "--apply" in sys.argv

    res = (
        supabase.table("content_items")
        .select("id, title, metadata, status")
        .is_("media_url", "null")
        .in_("status", ["pending_review", "published"])
        .execute()
    )
    rows = res.data or []
    print(f"{len(rows)} peça(s) sem media_url (pending_review/published).")

    fixed = 0
    still_missing = 0
    failed = 0
    for row in rows:
        meta = row.get("metadata") or {}
        source_url = meta.get("source_url")
        title = (row.get("title") or "")[:60]
        if not source_url:
            print(f"  [sem source_url] {title}")
            still_missing += 1
            continue
        try:
            source = fetch_source_article(source_url)
        except Exception as err:
            print(f"  [falhou a rebuscar] {title} — {err}")
            failed += 1
            continue
        if not source.image_url:
            print(f"  [continua sem imagem na fonte] {title}")
            still_missing += 1
            continue
        print(f"  [encontrada] {title} -> {source.image_url}")
        fixed += 1
        if apply:
            supabase.table("content_items").update({"media_url": source.image_url}).eq("id", row["id"]).execute()

    print(f"\n{fixed} encontrada(s){'(aplicado)' if apply else ' (dry-run — corre com --apply para gravar)'}, "
          f"{still_missing} continuam sem imagem na fonte, {failed} falharam a rebuscar.")


if __name__ == "__main__":
    main()
