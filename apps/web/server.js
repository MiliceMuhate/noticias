// Servidor do apps/web — site público com SSR (para o Google indexar o HTML
// já renderizado) + painel /admin como SPA. Substitui o nginx estático.
//
//   dev:  node server.js                 (Vite em middleware mode, HMR)
//   prod: NODE_ENV=production node server.js   (serve dist/client + dist/server)
//
// Só lê do ambiente em runtime SITE_URL/PORT — os VITE_* (chave anon, etc.) já
// vêm embebidos nos bundles em build-time, como antes.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import compression from 'compression'

const isProduction = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT) || 3000
const root = path.dirname(fileURLToPath(import.meta.url))

// Domínio público canónico, ex. "https://footballtrend.com" (sem "/" final).
// É o que vai para <link rel="canonical">, og:url, JSON-LD e sitemap.xml — em
// produção tem de estar definido, senão cada host/proxy que chegue cá gerava
// URLs canónicos diferentes.
const configuredSiteUrl = process.env.SITE_URL?.replace(/\/+$/, '')
if (isProduction && !configuredSiteUrl) {
  console.warn('[web] SITE_URL não definido — a usar o host de cada pedido nos URLs canónicos')
}

const app = express()
app.disable('x-powered-by')
// atrás do reverse proxy da VPS: req.protocol/host vêm de X-Forwarded-*
app.set('trust proxy', true)

function siteUrlFor(req) {
  return configuredSiteUrl ?? `${req.protocol}://${req.get('host')}`
}

let vite
let template = ''
if (isProduction) {
  app.use(compression())
  template = await fs.readFile(path.join(root, 'dist/client/index.html'), 'utf-8')
  app.use(
    '/assets',
    express.static(path.join(root, 'dist/client/assets'), { immutable: true, maxAge: '30d', index: false }),
  )
  // favicon, ads.txt, ... (public/) — index:false para "/" cair no SSR, não no index.html cru
  app.use(express.static(path.join(root, 'dist/client'), { index: false, maxAge: '1h' }))
} else {
  const { createServer } = await import('vite')
  vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' })
  app.use(vite.middlewares)
}

async function loadServerEntry() {
  if (isProduction) return import('./dist/server/entry-server.js')
  return vite.ssrLoadModule('/src/entry-server.tsx')
}

app.get('/healthz', (_req, res) => {
  res.type('text/plain').send('ok')
})

app.get('/robots.txt', async (req, res) => {
  const { renderRobots } = await loadServerEntry()
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(renderRobots(siteUrlFor(req)))
})

app.get('/sitemap.xml', async (req, res) => {
  try {
    const { renderSitemap } = await loadServerEntry()
    const xml = await renderSitemap(siteUrlFor(req))
    res.type('application/xml').set('Cache-Control', 'public, max-age=600').send(xml)
  } catch (err) {
    console.error('[web] falha a gerar sitemap.xml:', err)
    res.status(503).set('Retry-After', '300').type('text/plain').send('sitemap temporariamente indisponível')
  }
})

app.use(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).end()
    return
  }
  try {
    const url = req.originalUrl
    const html = isProduction
      ? template
      : await vite.transformIndexHtml(url, await fs.readFile(path.join(root, 'index.html'), 'utf-8'))
    const { render } = await loadServerEntry()
    const result = await render(url, siteUrlFor(req))

    // substituições por função: com uma string, "$&"/"$'" no texto de um
    // artigo seriam interpretados como padrões especiais do replace
    const page = html
      .replace('<!--app-head-->', () => result.head)
      .replace('<!--app-html-->', () => result.html)
      .replace('<!--app-state-->', () => result.state)
    res.status(result.status).set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', result.cacheControl)
    res.end(page)
  } catch (err) {
    vite?.ssrFixStacktrace(err)
    console.error('[web] erro no SSR:', err)
    res.status(500).type('text/plain').end('Erro interno')
  }
})

app.listen(port, () => {
  console.log(`[web] a servir em http://localhost:${port} (${isProduction ? 'produção' : 'dev'})`)
})
