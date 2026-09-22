# Deploy — VPS Contabo, sem GitHub Actions

A conta GitHub usada neste repositório tem o Actions bloqueado (questão de
faturação), por isso o deploy não passa por lá. Em vez disso, a própria VPS
faz tudo sozinha, disparada por um **webhook** do GitHub (isto é sempre
gratuito, não depende de Actions/Packages):

```
push em main -> GitHub dispara webhook -> `webhook` (systemd, na VPS) valida
a assinatura -> corre deploy/deploy.sh -> git pull + supabase db push +
docker compose build + docker compose up -d
```

## 1. Preparar a VPS

Pré-requisitos: Docker + plugin `docker compose`, `git`, Supabase CLI, e o
binário `webhook` (pacote `webhook` em Debian/Ubuntu — `adnanh/webhook`).

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git webhook

# Supabase CLI (confirma a versão mais recente em
# https://github.com/supabase/cli/releases)
curl -fsSL -o supabase.deb \
  https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.deb
sudo dpkg -i supabase.deb && rm supabase.deb

# utilizador dedicado ao deploy, no grupo docker
sudo useradd -m -G docker deploy
sudo -iu deploy
```

Clona o repositório para `/opt/noticias` (usa uma chave SSH de deploy,
read-only, adicionada em **Settings → Deploy keys** do repositório — isto
não é afetado pelo bloqueio de faturação, só o Actions/Packages estão):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/noticias_deploy -C "vps-deploy" -N ""
cat ~/.ssh/noticias_deploy.pub   # cola em GitHub -> repo -> Settings -> Deploy keys (read-only)
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/noticias_deploy
EOF
sudo git clone git@github.com:MiliceMuhate/noticias.git /opt/noticias
sudo chown -R deploy:deploy /opt/noticias
chmod +x /opt/noticias/deploy/deploy.sh
```

## 2. Ficheiros de segredos (só na VPS, nunca no git)

```bash
cd /opt/noticias/deploy
cp ../apps/api/.env.example api.env        # preenche com os valores reais da API
cp .env.example .env                        # VITE_* usados no build do web
cp deploy.env.example deploy.env            # WEBHOOK_SECRET + Supabase CLI
```

- `api.env` — runtime da API (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`, ver `apps/api/.env.example`).
- `.env` — só os `VITE_*` públicos, usados como build-args do Dockerfile do web.
- `deploy.env` — `WEBHOOK_SECRET` (gera com `openssl rand -hex 32`),
  `SUPABASE_ACCESS_TOKEN` (`supabase login` localmente para o obteres),
  `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` (do projeto de produção).

## 3. Serviço do webhook

```bash
sudo cp /opt/noticias/deploy/webhook.service /etc/systemd/system/webhook.service
sudo systemctl daemon-reload
sudo systemctl enable --now webhook
sudo systemctl status webhook
```

A porta `9000` fica local à VPS — expõe-a ao GitHub através do teu
reverse proxy existente (nginx/Caddy) com TLS, ex. um subdomínio
`https://deploy.o-teu-dominio.tld/hooks/deploy-noticias` a fazer proxy_pass
para `127.0.0.1:9000/hooks/deploy-noticias`. Sem proxy/TLS ainda, podes
expor a porta diretamente (`http://<ip-da-vps>:9000/hooks/deploy-noticias`)
para testar, mas troca para HTTPS antes de ires viver com isto de vez.

## 4. Webhook no GitHub

No repositório: **Settings → Webhooks → Add webhook**

- **Payload URL**: a URL do passo 3.
- **Content type**: `application/json`
- **Secret**: o mesmo valor de `WEBHOOK_SECRET` em `deploy.env`.
- **Events**: só "Just the push event".

`deploy/hooks.json` já filtra para só disparar em push a `refs/heads/main`.

## 5. Primeira execução

```bash
# manual, para validar antes de depender do webhook:
sudo -u deploy /opt/noticias/deploy/deploy.sh

# ou faz um push de teste em main e acompanha os logs do recetor:
journalctl -u webhook -f
```

Confirma:

- `docker compose ps` (dentro de `/opt/noticias/deploy`) mostra `api` e `web`
  a correr.
- `curl -s 127.0.0.1:8000/health` responde `{"status":"ok"}`.
- `curl -s 127.0.0.1:8080/` devolve o `index.html` do site.

## Nota — guardrail #4 (CLAUDE.md)

Nenhum segredo real vive no repositório: `api.env`, `.env` e `deploy.env`
existem só na VPS (o `.gitignore` já os exclui — só os `*.env.example`
ficam versionados). `SUPABASE_SERVICE_ROLE_KEY` e `ANTHROPIC_API_KEY` nunca
passam pelo GitHub, nem sequer pelo webhook — só pelo `api.env` local.

## Voltar a usar GitHub Actions mais tarde

Se resolveres o bloqueio de faturação da conta e quiseres voltar a um
pipeline no GitHub Actions (build+push para GHCR, deploy por SSH), a
abordagem anterior fica documentada no histórico do git deste ficheiro —
pergunta e eu reponho-a.
