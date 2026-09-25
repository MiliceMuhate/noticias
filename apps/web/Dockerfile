# apps/web — build de contexto na RAIZ do monorepo (precisa de pnpm-workspace.yaml
# e packages/shared): docker build -f apps/web/Dockerfile .
FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

RUN pnpm install --frozen-lockfile --filter web...

# Vite embebe estas variáveis nos bundles (browser E servidor SSR) em
# build-time — só valores públicos (chave anon, client id do AdSense,
# measurement id do GA4), nunca segredos (guardrail #4 do CLAUDE.md).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ADSENSE_CLIENT_ID
ARG VITE_GA_MEASUREMENT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_ADSENSE_CLIENT_ID=$VITE_ADSENSE_CLIENT_ID \
    VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID

RUN pnpm --filter web build
# pasta autónoma só com o que corre em produção: server.js + dist/ ("files"
# do package.json) + node_modules sem devDependencies
RUN pnpm --filter web deploy --prod /out

FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
