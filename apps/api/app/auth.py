"""
Autenticação das rotas /admin/* da API: o painel envia o JWT da sessão Supabase
do operador (Authorization: Bearer ...). A API valida-o no Supabase Auth e
confirma que o utilizador é operador (profiles.role, a mesma regra que
public.is_operator() impõe na BD).

Até à Fase 7 a API só era acessível dentro da VPS (127.0.0.1:8000) e estas
rotas não verificavam nada; com o botão "Testar" do painel passam a ser
alcançáveis a partir do browser (via proxy /api do apps/web/server.js), por isso
tem de ser aqui.
"""

from __future__ import annotations

from fastapi import Header, HTTPException

from .db import supabase


async def require_operator(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="sessão em falta")
    token = authorization.split(" ", 1)[1].strip()
    try:
        user = supabase.auth.get_user(token).user
    except Exception:
        user = None
    if not user:
        raise HTTPException(status_code=401, detail="sessão inválida ou expirada")
    profile = supabase.table("profiles").select("role").eq("id", user.id).maybe_single().execute()
    role = (profile.data or {}).get("role") if profile else None
    if role not in ("operator", "admin"):
        raise HTTPException(status_code=403, detail="só operadores")
    return user.id
