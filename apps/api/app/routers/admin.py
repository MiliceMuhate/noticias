"""
Gatilhos manuais para o operador (ex.: botão "detetar agora" no dashboard), fora
do ciclo normal do scheduler. Não substitui o gate de aprovação: estas rotas só
tocam em `topics`/deteção, nunca em `content_items.status`.
"""

from fastapi import APIRouter

from ..scheduler import discover_articles, generate_pending, score_detected_topics

router = APIRouter(prefix="/admin")


@router.post("/detect-now")
async def detect_now() -> dict[str, str]:
    await discover_articles()
    await score_detected_topics()
    return {"status": "ok"}


@router.post("/generate-now")
async def generate_now() -> dict[str, str]:
    await generate_pending()
    return {"status": "ok"}
