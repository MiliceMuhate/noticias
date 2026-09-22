"""
Deteção de notícias reais de futebol — só nas fontes que o operador configurar
(guardrail: nada de pesquisa aberta na internet). Único provider: RSS, via
`feedparser` — não precisa de nenhuma chave de API.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Protocol

import feedparser

Momentum = Literal["rising", "peaked", "falling"]


@dataclass
class DiscoveredArticle:
    term: str
    region: str
    category: str | None
    volume: int | None
    momentum: Momentum | None
    raw: Any  # entry completa do feed — inclui sempre 'link' (o artigo original)


class NewsSource(Protocol):
    kind: str

    async def discover(self, config: dict[str, Any]) -> list[DiscoveredArticle]: ...


class RssNewsSource:
    kind = "rss"

    async def discover(self, config: dict[str, Any]) -> list[DiscoveredArticle]:
        url = config.get("url")
        if not url:
            raise RuntimeError("fonte rss sem 'url' no config")

        feed = feedparser.parse(url)
        if feed.bozo and not feed.entries:
            raise RuntimeError(f"feed rss inválido/inacessível: {url} ({feed.bozo_exception})")

        region = config.get("region", "global")
        category = config.get("category")
        max_items = config.get("max_items", 10)

        articles: list[DiscoveredArticle] = []
        for entry in feed.entries[:max_items]:
            title = entry.get("title")
            link = entry.get("link")
            if not title or not link:
                continue
            articles.append(
                DiscoveredArticle(
                    term=title,
                    region=region,
                    category=category,
                    volume=None,
                    momentum="rising",  # todo item novo de um feed é, por definição, recente
                    raw={
                        "link": link,
                        "summary": entry.get("summary"),
                        "published": entry.get("published"),
                        "source_feed": url,
                    },
                )
            )
        return articles


def news_source_for(kind: str) -> NewsSource:
    if kind == "rss":
        return RssNewsSource()
    raise RuntimeError(f"NewsSource desconhecida: {kind}")
