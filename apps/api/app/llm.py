"""
Cliente Anthropic via o proxy AWS empresarial (mesmo padrão dos projetos
`explicador`/`portifolio`) — não é a API pública direta da Anthropic, por isso não
se usa o SDK oficial: chama-se `/v1/messages` diretamente, com o cabeçalho extra
`anthropic-workspace-id`.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field

import httpx

from .config import settings

ANTHROPIC_VERSION = "2023-06-01"

_client: httpx.AsyncClient | None = None
_lock = asyncio.Lock()

_CODE_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


@dataclass
class UsageTracker:
    """Acumula tokens de todas as chamadas de uma geração (ver docs/DATA_MODEL.md
    — jobs.input_tokens/output_tokens/cost_usd, aba "Gastos IA" do painel)."""

    input_tokens: int = field(default=0)
    output_tokens: int = field(default=0)

    def add(self, usage: dict) -> None:
        self.input_tokens += usage.get("input_tokens", 0) or 0
        self.output_tokens += usage.get("output_tokens", 0) or 0


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        async with _lock:
            if _client is None:
                _client = httpx.AsyncClient(
                    base_url=settings.anthropic_base_url,
                    headers={
                        "x-api-key": settings.anthropic_api_key,
                        "anthropic-version": ANTHROPIC_VERSION,
                        "anthropic-workspace-id": settings.anthropic_workspace_id,
                    },
                    timeout=120.0,
                )
    return _client


def _first_text(data: dict) -> str:
    text_block = next((b for b in data.get("content", []) if b.get("type") == "text"), None)
    if not text_block:
        raise ValueError("Resposta do LLM sem texto.")
    return text_block["text"]


def _parse_json_strict(raw: str) -> dict:
    """Remove cercas de código markdown antes de fazer parse — rede de segurança
    mesmo com output_config.format=json_schema (docs/publicador/PROMPTS.md, "erros de JSON")."""
    cleaned = _CODE_FENCE.sub("", raw.strip()).strip()
    return json.loads(cleaned)


async def complete(
    *,
    system: str,
    prompt: str,
    max_tokens: int = 4096,
    model: str | None = None,
    tracker: UsageTracker | None = None,
) -> str:
    """Chamada simples de texto: devolve o texto da resposta."""
    client = await _get_client()
    response = await client.post(
        "/v1/messages",
        json={
            "model": model or settings.anthropic_model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
        },
    )
    response.raise_for_status()
    data = response.json()
    if tracker is not None:
        tracker.add(data.get("usage", {}))
    return _first_text(data).strip()


async def complete_json(
    *,
    system: str,
    prompt: str,
    schema: dict,
    max_tokens: int = 1024,
    model: str | None = None,
    tracker: UsageTracker | None = None,
) -> dict:
    """Chamada com output estruturado — garante JSON válido segundo `schema`."""
    client = await _get_client()
    response = await client.post(
        "/v1/messages",
        json={
            "model": model or settings.anthropic_model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
            "output_config": {"format": {"type": "json_schema", "schema": schema}},
        },
    )
    response.raise_for_status()
    data = response.json()
    if tracker is not None:
        tracker.add(data.get("usage", {}))
    return _parse_json_strict(_first_text(data))
