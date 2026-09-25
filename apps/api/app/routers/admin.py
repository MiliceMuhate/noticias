"""
Gatilhos manuais para o operador (ex.: botão "detetar agora" no dashboard), fora
do ciclo normal do scheduler, e o teste de provedores de IA do painel. Não
substitui o gate de aprovação: estas rotas nunca tocam em `content_items.status`.

Todas exigem a sessão de um operador (ver app/auth.py).
"""

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_operator
from ..llm import test_model
from ..scheduler import discover_articles, generate_pending, score_detected_topics

router = APIRouter(prefix="/admin", dependencies=[Depends(require_operator)])


@router.post("/detect-now")
async def detect_now() -> dict[str, str]:
    await discover_articles()
    await score_detected_topics()
    return {"status": "ok"}


@router.post("/generate-now")
async def generate_now() -> dict[str, str]:
    await generate_pending()
    return {"status": "ok"}


class AiTestRequest(BaseModel):
    # a configuração tal como está no painel (pode ainda não estar gravada);
    # a chave NÃO vem aqui — é lida do Vault pelo id do provedor
    provider: dict[str, Any]
    model: str = Field(min_length=1, max_length=200)
    question: str = Field(min_length=1, max_length=500)


@router.post("/ai/test")
async def ai_test(req: AiTestRequest) -> dict[str, Any]:
    return await test_model(req.provider, req.model.strip(), req.question.strip())
