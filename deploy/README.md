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

Pré-requisitos: Docker + plugin `docker compose`, `git`, Supabase CLI, o
binário `webhook` (pacote `webhook` em Debian/Ubuntu — `adnanh/webhook`) e
`envsubst` (pacote `gettext-base` — gera o `hooks.json` real a partir do
molde, ver secção 3).

```bash
# se `docker --version` e `docker compose version` já respondem, o Docker já
# está instalado (ex. pelo repositório oficial download.docker.com) — não
# instales `docker.io`/`docker-compose-plugin` do Ubuntu por cima, entra em
# conflito (containerd.io vs containerd). Nesse caso só falta:
sudo apt update && sudo apt install -y git webhook gettext-base

# só se `docker` não existir de todo:
# sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin git webhook gettext-base

# Supabase CLI — o nome do .deb inclui a versão, por isso resolve-se a
# tag da última release primeiro (não existe um atalho "latest" com nome fixo)
SUPABASE_TAG=$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest \
  | grep -oP '"tag_name":\s*"\K[^"]+')
curl -fsSL -o supabase.deb \
  "https://github.com/supabase/cli/releases/download/${SUPABASE_TAG}/supabase_${SUPABASE_TAG#v}_linux_amd64.deb"
sudo dpkg -i supabase.deb && rm supabase.deb

# utilizador dedicado ao deploy, no grupo docker
sudo useradd -m -G docker deploy

# /opt/noticias pertence ao root por omissão — dá-o ao deploy ANTES de
# entrares nesse utilizador, para o clone a seguir não precisar de sudo
sudo mkdir -p /opt/noticias
sudo chown deploy:deploy /opt/noticias

sudo -iu deploy   # a partir daqui és o utilizador `deploy` (confirma no prompt)
```

Clona o repositório para `/opt/noticias` (usa uma chave SSH de deploy,
read-only, adicionada em **Settings → Deploy keys** do repositório — isto
não é afetado pelo bloqueio de faturação, só o Actions/Packages estão).
**Tudo o que se segue corre como o utilizador `deploy`, nunca com `sudo`** —
se usares `sudo` aqui, o comando passa a correr como `root`, que não conhece
esta chave, e o clone falha com "Permission denied (publickey)":

```bash
ssh-keygen -t ed25519 -f ~/.ssh/noticias_deploy -C "vps-deploy" -N ""
cat ~/.ssh/noticias_deploy.pub   # cola em GitHub -> repo -> Settings -> Deploy keys (read-only)
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/noticias_deploy
EOF

# confirma antes de clonar — deve responder "Hi <utilizador>! You've
# successfully authenticated..." (se dermos "Permission denied", a chave
# ainda não foi aceite no passo anterior, não avances)
ssh -T git@github.com

git clone git@github.com:MiliceMuhate/noticias.git /opt/noticias
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

`deploy/hooks.json` **não existe no git** (leva o `WEBHOOK_SECRET`) — só
existe `hooks.json.template`, com um placeholder `${WEBHOOK_SECRET}`. O
ficheiro real é gerado por `deploy.sh` a cada execução (`envsubst` +
`deploy.env`), por isso o serviço do webhook só pode arrancar depois da
primeira execução manual, a seguir.

## 3. Primeira execução (manual)

```bash
sudo -u deploy /opt/noticias/deploy/deploy.sh
```

Isto aplica as migrações Supabase, gera o `hooks.json` real (a partir do
molde) e constrói/arranca os containers. Confirma:

- `docker compose -f /opt/noticias/deploy/docker-compose.yml ps` mostra
  `api` e `web` a correr (`healthy`).
- `curl -s 127.0.0.1:8000/health` responde `{"status":"ok"}`.
- `curl -s 127.0.0.1:8080/` devolve a home já renderizada pelo servidor (SSR —
  o `<div id="root">` vem com as notícias, não vazio).
- `curl -s 127.0.0.1:8080/sitemap.xml` lista os artigos com URLs
  `https://footballtrend.online/...` (vem de `SITE_URL` em `deploy/.env`).
- `ls /opt/noticias/deploy/hooks.json` já existe.

## 4. Serviço do webhook

```bash
sudo cp /opt/noticias/deploy/webhook.service /etc/systemd/system/webhook.service
sudo systemctl daemon-reload
sudo systemctl enable --now webhook
sudo systemctl status webhook
```

O serviço corre com `-hotreload`: sempre que um deploy gera um `hooks.json`
novo (ex. porque rodaste o `WEBHOOK_SECRET`, ou porque o `.template` mudou),
o `webhook` recarrega-o sozinho, sem precisar de `systemctl restart`.

A porta `9000` fica local à VPS — expõe-a ao GitHub através do teu
reverse proxy existente (nginx/Caddy) com TLS, ex. um subdomínio
`https://deploy.o-teu-dominio.tld/hooks/deploy-noticias` a fazer proxy_pass
para `127.0.0.1:9000/hooks/deploy-noticias`. Sem proxy/TLS ainda, podes
expor a porta diretamente (`http://<ip-da-vps>:9000/hooks/deploy-noticias`)
para testar, mas troca para HTTPS antes de ires viver com isto de vez.

## 5. Webhook no GitHub

No repositório: **Settings → Webhooks → Add webhook**

- **Payload URL**: a URL do passo 4.
- **Content type**: `application/json`
- **Secret**: o mesmo valor de `WEBHOOK_SECRET` em `deploy.env` — cola-o
  (não escrevas à mão), tanto aqui como no `deploy.env`, para evitar erros
  de transcrição em strings hexadecimais longas.
- **Events**: só "Just the push event".

`deploy/hooks.json.template` já filtra para só disparar em push a
`refs/heads/main` (via `X-GitHub-Event: push` + `ref`). O "ping" automático
que o GitHub manda ao criar o webhook não é um push, por isso não deve
disparar o `deploy.sh` — mesmo que a entrega apareça marcada como "não
correspondida" nas "Recent Deliveries", isso não é o teste que importa.
Testa mesmo com um push real (ex. este commit) e confirma nos logs:

```bash
sudo journalctl -u webhook -f
```

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
