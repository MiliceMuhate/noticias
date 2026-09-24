# apps/web — build de contexto na RAIZ do monorepo (precisa de pnpm-workspace.yaml
# e packages/shared): docker build -f apps/web/Dockerfile .
FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

RUN pnpm install --frozen-lockfile --filter web...

# Vite embebe estas variáveis no bundle em build-time — só valores públicos
# (chave anon, client id do AdSense, measurement id do GA4), nunca segredos
# (guardrail #4 do CLAUDE.md).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ADSENSE_CLIENT_ID
ARG VITE_GA_MEASUREMENT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_ADSENSE_CLIENT_ID=$VITE_ADSENSE_CLIENT_ID \
    VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID

RUN pnpm --filter web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# "localhost" dentro do container resolve para ::1 primeiro (IPv6), e o nginx só
# escuta em IPv4 — por isso 127.0.0.1 explícito, não localhost
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
