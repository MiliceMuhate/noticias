"""
Vai buscar o texto principal de um artigo real (a partir do link descoberto em
`news_sources.py`). É esta a "fonte da verdade" que o LLM reescreve — nunca inventa
factos, nunca copia literalmente (ver `articles.py`).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

import trafilatura

# reserva para quando trafilatura.extract_metadata() não apanha a imagem (viu-se
# acontecer de forma intermitente na mesma página, provavelmente variação do HTML
# servido pela fonte) — procura o <meta> diretamente, tolerante à ordem dos atributos.
_META_TAG_RE = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
_META_KEY_RE = re.compile(r'(?:property|name)\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_META_CONTENT_RE = re.compile(r'content\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_IMAGE_META_KEYS = {"og:image", "og:image:secure_url", "og:image:url", "twitter:image", "twitter:image:src"}


def _fallback_image(html: str) -> str | None:
    for tag in _META_TAG_RE.findall(html):
        key_match = _META_KEY_RE.search(tag)
        if not key_match or key_match.group(1).lower() not in _IMAGE_META_KEYS:
            continue
        content_match = _META_CONTENT_RE.search(tag)
        if content_match and content_match.group(1):
            return content_match.group(1)
    return None


@dataclass
class SourceArticle:
    title: str | None
    text: str
    site_name: str
    url: str
    # imagem principal do artigo original (og:image/twitter:image), se existir.
    # Fica hotlinked à fonte — nunca descarregada/re-hospedada — mesma lógica de
    # atribuição do texto: é a imagem DELES, mostrada junto ao crédito, não uma
    # imagem nossa. Se o site bloquear hotlinking, a imagem simplesmente falha a
    # carregar no browser (o frontend trata isso com elegância).
    image_url: str | None


def _site_name_from_url(url: str) -> str:
    host = urlparse(url).netloc
    return host.removeprefix("www.")


def fetch_source_article(url: str) -> SourceArticle:
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise RuntimeError(f"não foi possível descarregar o artigo: {url}")

    text = trafilatura.extract(downloaded, favor_recall=True)
    if not text or not text.strip():
        raise RuntimeError(f"não foi possível extrair texto do artigo: {url}")

    metadata = trafilatura.extract_metadata(downloaded)
    title = metadata.title if metadata else None
    site_name = (metadata.sitename if metadata and metadata.sitename else None) or _site_name_from_url(url)
    image_url = (metadata.image if metadata and metadata.image else None) or _fallback_image(downloaded)

    return SourceArticle(title=title, text=text.strip(), site_name=site_name, url=url, image_url=image_url)


def mock_source_article(url: str) -> SourceArticle:
    """Só para dev (ALLOW_MOCK_FACTS=true) — claramente marcado como fictício."""
    return SourceArticle(
        title="[MOCK] Notícia de exemplo",
        text=(
            "[AMBIENTE DE DESENVOLVIMENTO — texto fictício]\n\n"
            "Isto substitui o texto real de um artigo, só para testar o pipeline "
            "sem depender de acesso à internet ao site de origem."
        ),
        site_name="dev-mock",
        url=url,
        image_url=None,
    )
