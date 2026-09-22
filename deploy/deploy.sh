#!/usr/bin/env bash
# Disparado por `webhook` (deploy/hooks.json) a cada push em main.
# Sem GitHub Actions: a própria VPS puxa o código, aplica as migrações
# Supabase, reconstrói as imagens localmente e reinicia os containers.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# segredos locais — nunca no git (deploy/deploy.env.example é só o molde)
set -a
source "$REPO_DIR/deploy/deploy.env"
set +a

echo "[deploy] $(date -Iseconds) — a atualizar para origin/main"
git fetch origin main
git reset --hard origin/main

echo "[deploy] a aplicar migrações Supabase"
supabase link --project-ref "$SUPABASE_PROJECT_REF" >/dev/null
supabase db push

echo "[deploy] a (re)construir e reiniciar containers"
cd "$REPO_DIR/deploy"
docker compose build
docker compose up -d --remove-orphans
docker image prune -f

echo "[deploy] concluído"
