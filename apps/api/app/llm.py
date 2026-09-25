"""
Camada de LLM com provedores configuráveis no painel (settings.ai_providers +
chaves no Supabase Vault — ver migração 20260925000001). Dois tipos de API:

- `anthropic`: `/v1/messages`. É também o provedor que já existia — o proxy AWS
  empresarial (mesmo padrão dos projetos `explicador`/`portifolio`), com o
  cabeçalho extra `anthropic-workspace-id` — quando `use_env_credentials=true`
  usa ANTHROPIC_API_KEY/BASE_URL/WORKSPACE_ID do .env.
- `openai_compatible`: `/chat/completions`. Cobre OpenAI, Gemini (endpoint
  compatível), Mistral, DeepSeek, Groq, OpenRouter, Ollama, etc.

Não se usa nenhum SDK oficial: são dois pedidos HTTP simples, e assim trocar de
provedor é só configuração.

Cada passo da cadeia pede o modelo pelo nome do passo (`step=`); o provedor e o
modelo vêm de settings.model_by_step (ver resolve_step).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Literal

import httpx

from .config import settings as env_settings
from .db import supabase
from .log import log_error
from .pricing import estimate_cost_usd

ANTHROPIC_VERSION = "2023-06-01"
ENV_PROVIDER_ID = "anthropic-env"

_CODE_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

ProviderKind = Literal["anthropic", "openai_compatible"]


@dataclass
class ModelPricing:
    input_usd_per_mtok: float | None = None
    output_usd_per_mtok: float | None = None


@dataclass
class Provider:
    id: str
    kind: ProviderKind
    label: str = ""
    base_url: str = ""
    use_env_credentials: bool = False
    # cabeçalhos extra NÃO secretos (ex.: anthropic-workspace-id, OpenRouter
    # HTTP-Referer). Segredos vão sempre para o Vault, nunca para aqui.
    headers: dict[str, str] = field(default_factory=dict)
    # openai_compatible: como pedir JSON. json_schema (estrito) é o ideal;
    # json_object/prompt para provedores que não o suportam.
    json_mode: Literal["json_schema", "json_object", "prompt"] = "json_schema"
    # alguns modelos OpenAI recentes só aceitam max_completion_tokens
    token_param: Literal["max_tokens", "max_completion_tokens"] = "max_tokens"
    models: dict[str, ModelPricing] = field(default_factory=dict)


@dataclass
class UsageTracker:
    """Acumula tokens E custo de todas as chamadas de uma geração (ver
    docs/DATA_MODEL.md — jobs.input_tokens/output_tokens/cost_usd, aba "Gastos
    IA" do painel). O custo é somado por chamada porque cada passo pode usar um
    provedor/modelo diferente, com preços diferentes."""

    input_tokens: int = field(default=0)
    output_tokens: int = field(default=0)
    cost_usd: float = field(default=0.0)
    models: set[str] = field(default_factory=set)

    def add(self, input_tokens: int, output_tokens: int, cost_usd: float, model_label: str) -> None:
        self.input_tokens += input_tokens or 0
        self.output_tokens += output_tokens or 0
        self.cost_usd += cost_usd or 0.0
        self.models.add(model_label)


# ---------------------------------------------------------------------------
# Configuração (settings.ai_providers / model_by_step), com cache curta — cada
# passo da cadeia resolve o seu modelo, e não vale a pena ir à BD 6x por artigo.
# ---------------------------------------------------------------------------

_CACHE_TTL_SEC = 30.0
_config_cache: tuple[float, dict[str, Any]] | None = None
_key_cache: dict[str, tuple[float, str | None]] = {}


def _env_provider() -> Provider:
    headers = {"anthropic-workspace-id": env_settings.anthropic_workspace_id} if env_settings.anthropic_workspace_id else {}
    return Provider(
        id=ENV_PROVIDER_ID,
        kind="anthropic",
        label="Anthropic (.env)",
        base_url=env_settings.anthropic_base_url,
        use_env_credentials=True,
        headers=headers,
    )


def _parse_provider(raw: dict[str, Any]) -> Provider | None:
    try:
        models: dict[str, ModelPricing] = {}
        for m in raw.get("models") or []:
            if isinstance(m, dict) and m.get("id"):
                models[m["id"]] = ModelPricing(m.get("input_usd_per_mtok"), m.get("output_usd_per_mtok"))
            elif isinstance(m, str):
                models[m] = ModelPricing()
        kind = raw.get("kind")
        if kind not in ("anthropic", "openai_compatible"):
            raise ValueError(f"kind desconhecido: {kind}")
        provider = Provider(
            id=str(raw["id"]),
            kind=kind,
            label=raw.get("label") or raw["id"],
            base_url=(raw.get("base_url") or "").rstrip("/"),
            use_env_credentials=bool(raw.get("use_env_credentials")),
            headers={str(k): str(v) for k, v in (raw.get("headers") or {}).items()},
            json_mode=raw.get("json_mode") or "json_schema",
            token_param=raw.get("token_param") or "max_tokens",
            models=models,
        )
        if provider.use_env_credentials:
            env = _env_provider()
            provider.base_url = provider.base_url or env.base_url
            provider.headers = {**env.headers, **provider.headers}
        if not provider.base_url:
            provider.base_url = "https://api.anthropic.com" if kind == "anthropic" else ""
        return provider
    except Exception as err:
        log_error("llm", "provedor mal configurado em settings.ai_providers — ignorado", err)
        return None


def _load_config() -> dict[str, Any]:
    global _config_cache
    now = time.monotonic()
    if _config_cache and now - _config_cache[0] < _CACHE_TTL_SEC:
        return _config_cache[1]
    res = supabase.table("settings").select("key, value").in_("key", ["ai_providers", "model_by_step"]).execute()
    by_key = {row["key"]: row["value"] for row in (res.data or [])}
    ai = by_key.get("ai_providers") if isinstance(by_key.get("ai_providers"), dict) else {}
    providers: dict[str, Provider] = {}
    for raw in ai.get("providers") or []:
        p = _parse_provider(raw) if isinstance(raw, dict) else None
        if p:
            providers[p.id] = p
    providers.setdefault(ENV_PROVIDER_ID, _env_provider())
    default = ai.get("default") if isinstance(ai.get("default"), dict) else {}
    cfg = {
        "providers": providers,
        "default_provider": default.get("provider") or ENV_PROVIDER_ID,
        "default_model": default.get("model") or env_settings.anthropic_model,
        "by_step": by_key.get("model_by_step") if isinstance(by_key.get("model_by_step"), dict) else {},
    }
    _config_cache = (now, cfg)
    return cfg


def resolve_step(step: str) -> tuple[Provider, str]:
    """settings.model_by_step[step] → (provedor, modelo).

    Aceita os dois formatos: o antigo (só o nome do modelo, no provedor por
    omissão) e o novo `{"provider": ..., "model": ...}`. Um provedor que não
    existe (apagado no painel) cai para o por omissão em vez de rebentar a
    geração a meio."""
    cfg = _load_config()
    providers: dict[str, Provider] = cfg["providers"]
    entry = cfg["by_step"].get(step)
    provider_id, model = cfg["default_provider"], cfg["default_model"]
    if isinstance(entry, str) and entry:
        model = entry
    elif isinstance(entry, dict):
        provider_id = entry.get("provider") or provider_id
        model = entry.get("model") or model
    provider = providers.get(provider_id)
    if provider is None:
        log_error("llm", f"passo {step}: provedor '{provider_id}' não existe — a usar o por omissão")
        provider = providers.get(cfg["default_provider"]) or providers[ENV_PROVIDER_ID]
    return provider, model


def _api_key(provider: Provider) -> str:
    if provider.use_env_credentials:
        return env_settings.anthropic_api_key
    now = time.monotonic()
    cached = _key_cache.get(provider.id)
    if cached and now - cached[0] < _CACHE_TTL_SEC:
        key = cached[1]
    else:
        res = supabase.rpc("get_ai_provider_key", {"p_provider_id": provider.id}).execute()
        key = res.data if isinstance(res.data, str) and res.data else None
        _key_cache[provider.id] = (now, key)
    if not key:
        raise RuntimeError(f"provedor de IA '{provider.id}' sem chave configurada (Configuração → Provedores de IA)")
    return key


# um cliente HTTP por (provedor, url, chave) — reaproveita ligações entre passos
_clients: dict[str, httpx.AsyncClient] = {}
_lock = asyncio.Lock()


async def _client_for(provider: Provider) -> httpx.AsyncClient:
    key = _api_key(provider)
    fingerprint = hashlib.sha256(f"{provider.id}|{provider.base_url}|{key}|{sorted(provider.headers.items())}".encode()).hexdigest()
    client = _clients.get(fingerprint)
    if client:
        return client
    async with _lock:
        client = _clients.get(fingerprint)
        if client:
            return client
        if provider.kind == "anthropic":
            headers = {"x-api-key": key, "anthropic-version": ANTHROPIC_VERSION, **provider.headers}
        else:
            headers = {"Authorization": f"Bearer {key}", **provider.headers}
        client = httpx.AsyncClient(base_url=provider.base_url, headers=headers, timeout=120.0)
        _clients[fingerprint] = client
        return client


def _cost(provider: Provider, model: str, input_tokens: int, output_tokens: int) -> float:
    pricing = provider.models.get(model)
    if pricing and pricing.input_usd_per_mtok is not None and pricing.output_usd_per_mtok is not None:
        return (input_tokens / 1_000_000) * pricing.input_usd_per_mtok + (output_tokens / 1_000_000) * pricing.output_usd_per_mtok
    return estimate_cost_usd(model, input_tokens, output_tokens)


def _parse_json_strict(raw: str) -> dict:
    """Remove cercas de código markdown antes de fazer parse — rede de segurança
    mesmo com saída estruturada (docs/publicador/PROMPTS.md, "erros de JSON")."""
    cleaned = _CODE_FENCE.sub("", raw.strip()).strip()
    return json.loads(cleaned)


def _schema_instruction(schema: dict) -> str:
    return (
        "\n\nResponde exclusivamente com um objeto JSON válido (sem texto antes ou depois, "
        "sem cercas de código) que respeite este JSON Schema:\n" + json.dumps(schema, ensure_ascii=False)
    )


# ---------------------------------------------------------------------------
# Chamadas por tipo de API
# ---------------------------------------------------------------------------

async def _anthropic_call(
    provider: Provider, model: str, system: str, prompt: str, max_tokens: int, schema: dict | None
) -> tuple[str, int, int]:
    client = await _client_for(provider)
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": prompt}],
    }
    if schema is not None:
        body["output_config"] = {"format": {"type": "json_schema", "schema": schema}}
    response = await client.post("/v1/messages", json=body)
    _raise_for_status(provider, model, response)
    data = response.json()
    text_block = next((b for b in data.get("content", []) if b.get("type") == "text"), None)
    if not text_block:
        raise ValueError("Resposta do LLM sem texto.")
    usage = data.get("usage") or {}
    return text_block["text"], usage.get("input_tokens", 0) or 0, usage.get("output_tokens", 0) or 0


async def _openai_call(
    provider: Provider, model: str, system: str, prompt: str, max_tokens: int, schema: dict | None
) -> tuple[str, int, int]:
    client = await _client_for(provider)
    mode = provider.json_mode if schema is not None else None

    def build(json_mode: str | None) -> dict[str, Any]:
        sys_text = system + (_schema_instruction(schema) if schema is not None and json_mode != "json_schema" else "")
        body: dict[str, Any] = {
            "model": model,
            provider.token_param: max_tokens,
            "messages": [{"role": "system", "content": sys_text}, {"role": "user", "content": prompt}],
        }
        if json_mode == "json_schema":
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "output", "schema": schema, "strict": True},
            }
        elif json_mode == "json_object":
            body["response_format"] = {"type": "json_object"}
        return body

    response = await client.post("/chat/completions", json=build(mode))
    # provedor "compatível" que afinal não suporta json_schema: tenta uma vez
    # com json_object + schema no prompt, em vez de falhar a geração inteira
    if response.status_code == 400 and mode == "json_schema" and "response_format" in response.text:
        response = await client.post("/chat/completions", json=build("json_object"))
    _raise_for_status(provider, model, response)
    data = response.json()
    choices = data.get("choices") or []
    content = (choices[0].get("message") or {}).get("content") if choices else None
    if not content:
        raise ValueError("Resposta do LLM sem texto.")
    usage = data.get("usage") or {}
    return content, usage.get("prompt_tokens", 0) or 0, usage.get("completion_tokens", 0) or 0


def _raise_for_status(provider: Provider, model: str, response: httpx.Response) -> None:
    if response.is_success:
        return
    # o corpo do erro é o que explica o problema (modelo inexistente, chave
    # inválida, parâmetro não suportado) — sem ele o painel só mostrava "400"
    raise RuntimeError(
        f"{provider.label or provider.id} / {model}: HTTP {response.status_code} — {response.text[:500]}"
    )


async def _call(
    step: str, system: str, prompt: str, max_tokens: int, schema: dict | None, tracker: UsageTracker | None
) -> str:
    provider, model = resolve_step(step)
    call = _anthropic_call if provider.kind == "anthropic" else _openai_call
    text, input_tokens, output_tokens = await call(provider, model, system, prompt, max_tokens, schema)
    if tracker is not None:
        tracker.add(input_tokens, output_tokens, _cost(provider, model, input_tokens, output_tokens), f"{provider.id}/{model}")
    return text


async def complete(
    *,
    step: str,
    system: str,
    prompt: str,
    max_tokens: int = 4096,
    tracker: UsageTracker | None = None,
) -> str:
    """Chamada simples de texto: devolve o texto da resposta."""
    return (await _call(step, system, prompt, max_tokens, None, tracker)).strip()


async def complete_json(
    *,
    step: str,
    system: str,
    prompt: str,
    schema: dict,
    max_tokens: int = 1024,
    tracker: UsageTracker | None = None,
) -> dict:
    """Chamada com output estruturado — JSON válido segundo `schema`."""
    return _parse_json_strict(await _call(step, system, prompt, max_tokens, schema, tracker))
