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

# hooks.json nunca fica no git (leva o WEBHOOK_SECRET) — gera-se aqui a partir
# do molde + deploy.env. O `webhook` corre com -hotreload, por isso apanha
# esta escrita sozinho, sem precisar de restart do serviço.
echo "[deploy] a gerar hooks.json a partir do molde"
envsubst '${WEBHOOK_SECRET}' < "$REPO_DIR/deploy/hooks.json.template" > "$REPO_DIR/deploy/hooks.json"

echo "[deploy] a aplicar migrações Supabase"
supabase link --project-ref "$SUPABASE_PROJECT_REF" >/dev/null
supabase db push

echo "[deploy] a (re)construir e reiniciar containers"
cd "$REPO_DIR/deploy"
docker compose build
docker compose up -d --remove-orphans
docker image prune -f

echo "[deploy] concluído"
