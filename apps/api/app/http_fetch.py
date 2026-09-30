"""
Pedidos HTTP a sites de notícias (feeds RSS e artigos) com a identificação de
um browser normal. Com a identificação por omissão das bibliotecas
("feedparser/…", a do trafilatura) muitos sites respondem 403 a pedidos de
servidores — foi o que aconteceu com a ESPN a partir da VPS em 2026-09-25, e o
erro chegava ao log como "mismatched tag" (o feedparser a ler a página de erro
como se fosse XML). Aqui o código HTTP vem sempre no erro.

Isto não contorna bloqueios deliberados por IP — se um site bloquear o
endereço do servidor, continua bloqueado; é para não ser barrado só pela
identificação.
"""

from __future__ import annotations

import httpx

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
}


class FetchError(RuntimeError):
    def __init__(self, url: str, reason: str):
        super().__init__(f"{reason}: {url}")
        self.url = url
        self.reason = reason


def fetch_text(url: str, timeout: float = 20.0) -> str:
    try:
        response = httpx.get(url, headers=BROWSER_HEADERS, follow_redirects=True, timeout=timeout)
    except httpx.HTTPError as err:
        raise FetchError(url, f"sem ligação ({type(err).__name__})") from err
    if response.status_code != 200:
        # 403/429 de um site de notícias = quase sempre bloqueio do servidor
        raise FetchError(url, f"HTTP {response.status_code}")
    return response.text
