"""Pesquisa manual de notícias. Uma pesquisa = um pedido Brave; nunca chama o LLM.

O resultado entra em `scored` para revisão humana, após deduplicação e leitura
do texto da fonte. Artigos e jobs antigos (incluindo tópicos arquivados) contam
para a deduplicação. O URL original é guardado para atribuição no artigo.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import ipaddress
import re
from difflib import SequenceMatcher
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from fastapi import HTTPException

from ..config import settings
from ..db import supabase
from .source_article import fetch_source_article

SOURCE_ID = "c23bb071-1fe0-43d9-8402-014d84b2e855"
MAX_SEARCHES_PER_DAY = 10
MAX_RESULTS = 8
_TRACKING = {"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"}


def normalized_url(raw: str) -> str:
    parsed = urlsplit(raw.strip())
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if parsed.scheme not in ("http", "https") or not host or parsed.username or parsed.password:
        return ""
    if host == "localhost" or host.endswith(".local"):
        return ""
    try:
        if not ipaddress.ip_address(host).is_global:
            return ""
    except ValueError:
        pass
    try:
        port = f":{parsed.port}" if parsed.port and parsed.port not in (80, 443) else ""
    except ValueError:
        return ""
    params = [(k, v) for k, v in parse_qsl(parsed.query) if not k.lower().startswith("utm_") and k.lower() not in _TRACKING]
    return urlunsplit(("https", host + port, parsed.path.rstrip("/") or "/", urlencode(sorted(params)), ""))


def same_story(title: str, other: str) -> bool:
    """Limiar conservador para títulos muito parecidos, inclusive de outros sites."""
    words = lambda value: re.findall(r"\w+", value.lower(), flags=re.UNICODE)
    a, b = words(title), words(other)
    if len(a) < 5 or len(b) < 5:
        return False
    common = len(set(a) & set(b))
    return common >= 5 and (common / min(len(set(a)), len(set(b))) >= 0.8 or SequenceMatcher(None, a, b).ratio() >= 0.85)


async def _readable(url: str) -> bool:
    try:
        source = await asyncio.wait_for(asyncio.to_thread(fetch_source_article, url), timeout=15)
        return len(source.text.split()) >= 120
    except Exception:
        return False


async def search_and_queue(query: str, actor_id: str) -> dict:
    if not settings.brave_search_api_key:
        raise HTTPException(status_code=503, detail="Pesquisa indisponível: configura BRAVE_SEARCH_API_KEY no api.env da VPS.")

    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)).isoformat()
    used = (
        supabase.table("audit_log").select("id", count="exact").limit(1)
        .eq("action", "manual_news_search").gte("created_at", since).execute()
    )
    if (used.count or 0) >= MAX_SEARCHES_PER_DAY:
        raise HTTPException(status_code=429, detail=f"Limite de {MAX_SEARCHES_PER_DAY} pesquisas em 24 horas atingido.")

    # A auditoria é gravada antes do pedido para que toques repetidos no botão
    # não façam consumo ilimitado. Guarda a pesquisa, nunca a chave.
    supabase.table("audit_log").insert({
        "actor": actor_id, "action": "manual_news_search", "entity": "source",
        "entity_id": SOURCE_ID, "detail": {"query": query},
    }).execute()

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            response = await client.get(
                "https://api.search.brave.com/res/v1/news/search",
                params={"q": query, "freshness": "pd", "count": MAX_RESULTS, "country": "ALL"},
                headers={"X-Subscription-Token": settings.brave_search_api_key, "Accept": "application/json"},
            )
            response.raise_for_status()
            results = response.json().get("results", [])[:MAX_RESULTS]
        except (httpx.HTTPError, ValueError) as err:
            raise HTTPException(status_code=502, detail=f"A pesquisa de notícias falhou: {str(err)[:180]}") from err

    # Comparar com o histórico, incluindo arquivados; o índice de URL dos
    # artigos publicados/pedentes continua a ser verificado na geração.
    recent = (
        supabase.table("topics").select("term, raw_data")
        .order("detected_at", desc=True).limit(1000).execute()
    ).data or []
    known_urls = {normalized_url((row.get("raw_data") or {}).get("link") or "") for row in recent}
    titles = [row.get("term") or "" for row in recent]
    articles = (supabase.table("content_items").select("title")
                .order("created_at", desc=True).limit(1000).execute()).data or []
    titles.extend(row.get("title") or "" for row in articles)
    report: list[dict] = []

    for result in results:
        title, url = (result.get("title") or "").strip(), (result.get("url") or "").strip()
        canonical = normalized_url(url)
        item = {"title": title, "url": url, "status": "", "reason": ""}
        if not title or not canonical:
            item.update(status="skipped", reason="URL ou título inválido")
        elif canonical in known_urls or any(normalized_url(entry["url"]) == canonical for entry in report):
            item.update(status="duplicate", reason="URL já detetado")
        elif (
            supabase.table("topics").select("id").eq("raw_data->>link", url).limit(1).execute().data
            or supabase.table("content_items").select("id").eq("metadata->>source_url", url).limit(1).execute().data
        ):
            item.update(status="duplicate", reason="URL já guardado na base de dados")
        elif any(same_story(title, old) for old in titles):
            item.update(status="duplicate", reason="notícia muito semelhante a uma já detetada")
        elif not await _readable(url):
            item.update(status="unreadable", reason="a fonte não forneceu texto suficiente ao servidor")
        else:
            try:
                supabase.table("topics").insert({
                    "source_id": SOURCE_ID, "term": title, "region": "INT",
                    "category": "football", "momentum": "rising", "status": "scored",
                    "raw_data": {"link": url, "source": "brave_news", "page_age": result.get("page_age")},
                }).execute()
                item.update(status="added", reason="disponível em Tendências para geração manual")
                known_urls.add(canonical)
                titles.append(title)
            except Exception as err:
                # Índice diário também protege de uma pesquisa concorrente.
                if "23505" in str(err):
                    item.update(status="duplicate", reason="já detetada hoje")
                else:
                    raise
        report.append(item)

    return {"query": query, "searched": len(results), "remaining_today": max(0, MAX_SEARCHES_PER_DAY - (used.count or 0) - 1), "results": report}
