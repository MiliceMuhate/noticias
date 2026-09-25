"""Provedores de IA configuráveis (app/llm.py) e política do piloto automático
(scheduler._is_autopublish_ready) — ambos lidos de settings editáveis no painel."""

from __future__ import annotations

import json

import httpx
import pytest

from app import llm
from app.scheduler import _is_autopublish_ready


# --- política do piloto -------------------------------------------------------

STRICT = {"min_originality": "pass", "min_audit": "aprovado"}
LOOSE = {"min_originality": "review", "min_audit": "rever"}


def meta(originality: str, audit: str | None) -> dict:
    return {"originality": {"verdict": originality}, "self_audit": {"veredicto": audit} if audit else None}


def test_strict_policy_only_publishes_pass_and_aprovado():
    assert _is_autopublish_ready(meta("pass", "aprovado"), STRICT)
    assert not _is_autopublish_ready(meta("pass", "rever"), STRICT)
    assert not _is_autopublish_ready(meta("review", "aprovado"), STRICT)


def test_loose_policy_accepts_review_but_never_block():
    assert _is_autopublish_ready(meta("review", "rever"), LOOSE)
    assert not _is_autopublish_ready(meta("block", "aprovado"), LOOSE)
    assert not _is_autopublish_ready(meta("pass", "bloquear"), LOOSE)


def test_unknown_policy_values_fall_back_to_strict():
    assert not _is_autopublish_ready(meta("pass", "rever"), {"min_audit": "qualquer"})


# --- resolução de provedor/modelo por passo --------------------------------------

@pytest.fixture
def config(monkeypatch):
    other = llm.Provider(id="openai", kind="openai_compatible", base_url="https://api.example.com/v1")
    cfg = {
        "providers": {llm.ENV_PROVIDER_ID: llm._env_provider(), "openai": other},
        "default_provider": llm.ENV_PROVIDER_ID,
        "default_model": "claude-haiku-4-5",
        "by_step": {
            "write_article": {"provider": "openai", "model": "gpt-x"},
            "package": "claude-sonnet-5",  # formato antigo: só o modelo
            "self_audit": {"provider": "apagado", "model": "m"},
        },
    }
    monkeypatch.setattr(llm, "_load_config", lambda: cfg)
    return cfg


def test_resolve_step_new_and_legacy_formats(config):
    provider, model = llm.resolve_step("write_article")
    assert (provider.id, model) == ("openai", "gpt-x")
    provider, model = llm.resolve_step("package")
    assert (provider.id, model) == (llm.ENV_PROVIDER_ID, "claude-sonnet-5")
    provider, model = llm.resolve_step("extract_facts")
    assert (provider.id, model) == (llm.ENV_PROVIDER_ID, "claude-haiku-4-5")


def test_resolve_step_missing_provider_falls_back_to_default(config):
    provider, _ = llm.resolve_step("self_audit")
    assert provider.id == llm.ENV_PROVIDER_ID


def test_parse_provider_rejects_unknown_kind():
    assert llm._parse_provider({"id": "x", "kind": "bard"}) is None


# --- chamada openai_compatible ------------------------------------------------------

async def test_openai_call_falls_back_to_json_object_and_tracks_cost(monkeypatch):
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        if body.get("response_format", {}).get("type") == "json_schema":
            return httpx.Response(400, text='{"error": "response_format json_schema not supported"}')
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": '```json\n{"ok": true}\n```'}}],
                "usage": {"prompt_tokens": 1000, "completion_tokens": 500},
            },
        )

    provider = llm.Provider(
        id="p",
        kind="openai_compatible",
        base_url="https://api.example.com/v1",
        models={"m": llm.ModelPricing(2.0, 4.0)},
    )
    client = httpx.AsyncClient(base_url=provider.base_url, transport=httpx.MockTransport(handler))

    async def fake_client(_p):
        return client

    monkeypatch.setattr(llm, "_client_for", fake_client)
    monkeypatch.setattr(llm, "resolve_step", lambda step: (provider, "m"))

    tracker = llm.UsageTracker()
    out = await llm.complete_json(step="write_article", system="s", prompt="p", schema={"type": "object"}, tracker=tracker)

    assert out == {"ok": True}
    assert [b.get("response_format", {}).get("type") for b in bodies] == ["json_schema", "json_object"]
    assert "JSON Schema" in bodies[1]["messages"][0]["content"]  # schema passa para o prompt
    assert (tracker.input_tokens, tracker.output_tokens) == (1000, 500)
    assert tracker.cost_usd == pytest.approx(1000 / 1e6 * 2.0 + 500 / 1e6 * 4.0)


# --- preços com data de mudança ------------------------------------------------------

def test_cost_uses_price_in_force_on_the_day():
    import datetime

    provider = llm._parse_provider(
        {
            "id": "g",
            "kind": "openai_compatible",
            "models": [
                {
                    "id": "gemini-3.8-flash",
                    "input_usd_per_mtok": 0.75,
                    "output_usd_per_mtok": 3.75,
                    "price_changes": [{"from": "2027-01-01", "input_usd_per_mtok": 1.5, "output_usd_per_mtok": 7.5}],
                }
            ],
        }
    )
    before = llm._cost(provider, "gemini-3.8-flash", 1_000_000, 1_000_000, datetime.date(2026, 12, 31))
    after = llm._cost(provider, "gemini-3.8-flash", 1_000_000, 1_000_000, datetime.date(2027, 1, 1))
    assert before == pytest.approx(0.75 + 3.75)
    assert after == pytest.approx(1.5 + 7.5)


def test_incomplete_price_change_is_ignored():
    provider = llm._parse_provider(
        {"id": "g", "kind": "openai_compatible",
         "models": [{"id": "m", "input_usd_per_mtok": 1, "output_usd_per_mtok": 2, "price_changes": [{"from": "2027-01-01"}]}]}
    )
    assert provider.models["m"].changes == []
