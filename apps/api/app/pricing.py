"""
Estimativa de custo por chamada ao LLM. Preços públicos da API Anthropic
(USD por milhão de tokens) — a chave real deste projeto corre por um proxy AWS
empresarial (ver `app/llm.py`), cujo tarifário pode divergir do público; trata
os valores daqui como uma estimativa, não uma fatura exata.
"""

from __future__ import annotations

MODEL_PRICING_USD_PER_MTOK: dict[str, dict[str, float]] = {
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00},
    "claude-sonnet-5": {"input": 2.00, "output": 10.00},
    "claude-opus-5": {"input": 5.00, "output": 25.00},
}


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    pricing = MODEL_PRICING_USD_PER_MTOK.get(model)
    if not pricing:
        return 0.0
    return (input_tokens / 1_000_000) * pricing["input"] + (output_tokens / 1_000_000) * pricing["output"]
