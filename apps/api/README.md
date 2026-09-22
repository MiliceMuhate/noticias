# apps/api

Backend FastAPI: deteta artigos novos em feeds RSS de futebol configurados,
reescreve-os (nunca inventa, sempre com atribuição) e o scheduler interno que os
corre. Ver `docs/ARCHITECTURE.md`. Sem chaves de API para as fontes — só a `URL`
do feed, configurada na tabela `sources` (painel → Configuração).

## Arranque local

```bash
cd apps/api
python -m venv .venv
.venv/Scripts/activate        # Windows; em Unix: source .venv/bin/activate
pip install -e .
cp .env.example .env           # preenche as chaves
uvicorn app.main:app --reload --port 8000
```

`GET /health` confirma que está no ar. O scheduler arranca com a app (ver
`app/scheduler.py`) — não precisa de nenhum passo extra nem de cron externo.

`POST /admin/detect-now` e `POST /admin/generate-now` disparam os ciclos fora do
intervalo normal (útil em dev/teste manual).
