# Deploy — VPS Contabo via GitHub Actions

O workflow `.github/workflows/deploy.yml` corre em cada push a `main`:

1. Testa `apps/api` (pytest) e `apps/web` (typecheck).
2. Aplica as migrações Supabase pendentes ao projeto de produção (`supabase db push`).
3. Constrói as imagens Docker de `apps/api` e `apps/web` e envia-as para o
   GitHub Container Registry (`ghcr.io`).
4. Liga-se por SSH à VPS, atualiza `docker-compose.yml` e corre
   `docker compose pull && docker compose up -d`.

Este README documenta o que precisas de configurar **uma vez** — o resto é automático.

## 1. Preparar a VPS

```bash
# na VPS, como o utilizador que o deploy vai usar
mkdir -p /opt/noticias
cd /opt/noticias

# login no GHCR uma única vez (token com scope read:packages, gerado em
# github.com/settings/tokens — não precisa de expirar, mas pode ser revogado
# e recriado se preferires; fica só em ~/.docker/config.json na VPS)
docker login ghcr.io -u <o-teu-user-github>

# ficheiro com os segredos reais da API — nunca commitado
cp apps/api/.env.example api.env   # depois edita com valores reais
```

`api.env` deve ter, no mínimo: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY` (ver `apps/api/.env.example` para a lista completa).

Se ainda não há um proxy reverso na VPS: qualquer nginx/Caddy à frente, a
apontar o domínio público para `127.0.0.1:8080` (web) e `/api` (ou subdomínio)
para `127.0.0.1:8000` (api), com TLS — isso fica fora deste workflow.

## 2. Chave SSH dedicada ao deploy

```bash
ssh-keygen -t ed25519 -f deploy_key -C "github-actions-deploy" -N ""
# copia deploy_key.pub para ~/.ssh/authorized_keys do utilizador de deploy na VPS
# guarda o conteúdo de deploy_key (privada) no secret VPS_SSH_KEY (passo 3)
```

## 3. Secrets e Variables no GitHub

Em **Settings → Secrets and variables → Actions** do repositório:

### Secrets (`Secrets`)

| Nome | Para quê |
|---|---|
| `VPS_HOST` | IP ou domínio da VPS Contabo |
| `VPS_USER` | utilizador SSH do deploy |
| `VPS_SSH_KEY` | chave privada gerada no passo 2 |
| `VPS_PORT` | porta SSH, se não for 22 (opcional) |
| `VPS_DEPLOY_PATH` | caminho na VPS, ex. `/opt/noticias` |
| `SUPABASE_ACCESS_TOKEN` | token pessoal (`supabase login`), para `supabase db push` em CI |
| `SUPABASE_PROJECT_REF` | ref do projeto Supabase de produção |
| `SUPABASE_DB_PASSWORD` | password da BD do projeto de produção |
| `VITE_SUPABASE_URL` | URL do projeto Supabase — embebido no build do web |
| `VITE_SUPABASE_ANON_KEY` | chave `anon` — embebida no build do web (pública por natureza, mas mantém-se como secret aqui) |

### Variables (`Variables`, não secretas)

| Nome | Para quê |
|---|---|
| `VITE_ADSENSE_CLIENT_ID` | client id do AdSense (opcional; deixa por definir até teres a conta aprovada) |

`GITHUB_TOKEN` (login no GHCR durante o build) é automático — não precisas de criar nada.

## 3 bis. Aviso sobre visibilidade do repositório

Guardrail #4 do `CLAUDE.md`: nenhum segredo no repositório. `SUPABASE_SERVICE_ROLE_KEY`
e `ANTHROPIC_API_KEY` **nunca** entram no workflow nem no `docker-compose.yml` — só
existem em `api.env`, na VPS. Se o repositório for privado, as imagens no GHCR também
ficam privadas por omissão (daí o `docker login` manual no passo 1).

## 4. Primeira execução

Depois de configurados os secrets, faz push para `main` (ou corre o workflow
manualmente em **Actions → Deploy produção → Run workflow**). Confirma:

- `docker compose ps` na VPS mostra `api` e `web` a correr (`healthy`).
- `curl -s 127.0.0.1:8000/health` responde `{"status":"ok"}`.
- `curl -s 127.0.0.1:8080/` devolve o `index.html` do site.
