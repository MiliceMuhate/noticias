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
# esta escrita sozinho, sem precisar de restart do serviço — mas só se for
# atómica: escrever direto com "> hooks.json" trunca o ficheiro para vazio
# por um instante, e o vigilante de ficheiros pode apanhar esse vazio e
# ficar sem hooks carregados (404 em tudo). mv no mesmo filesystem é atómico.
echo "[deploy] a gerar hooks.json a partir do molde"
envsubst '${WEBHOOK_SECRET}' < "$REPO_DIR/deploy/hooks.json.template" > "$REPO_DIR/deploy/hooks.json.tmp"
mv "$REPO_DIR/deploy/hooks.json.tmp" "$REPO_DIR/deploy/hooks.json"

echo "[deploy] a aplicar migrações Supabase"
supabase link --project-ref "$SUPABASE_PROJECT_REF" >/dev/null
supabase db push

echo "[deploy] a (re)construir e reiniciar containers"
cd "$REPO_DIR/deploy"
# site e API primeiro, e sozinhos: uma falha no Hermes (imagem externa,
# opcional) nunca pode impedir o site de atualizar — já aconteceu uma vez.
docker compose build api web
docker compose up -d --remove-orphans api web

# Hermes (descoberta de notícias): se falhar, fica o aviso e o resto segue
if docker compose build hermes && docker compose up -d hermes; then
  echo "[deploy] hermes atualizado"
else
  echo "[deploy] AVISO: o contentor do Hermes não construiu/arrancou — o site e a API foram atualizados na mesma"
fi
docker image prune -f

echo "[deploy] concluído"
