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

// --- língua do visitante ------------------------------------------------------
// Espelha src/lib/i18n.ts (LANGS, DEFAULT_LANG, LANG_COOKIE). O português vive
// na raiz; as outras línguas têm prefixo. Só se decide aqui para URLs SEM
// prefixo e só para quem ainda não escolheu no seletor (cookie `lang`) — um
// link /en/... abre sempre em inglês, e um visitante que escolheu português
// fica em português.
const SUPPORTED_LANGS = ['pt', 'en', 'es', 'fr']
const PREFIXED_LANGS = ['en', 'es', 'fr']
const LANG_COOKIE = 'lang'

// país → língua. Países fora desta lista caem para o Accept-Language do browser
// e, sem nada que sirva, para inglês (visitante estrangeiro).
const COUNTRY_LANG = {
  pt: ['PT', 'BR', 'MZ', 'AO', 'CV', 'GW', 'ST', 'TL'],
  es: ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'GQ', 'PR'],
  fr: ['FR', 'MC', 'LU', 'SN', 'CI', 'CM', 'ML', 'BF', 'NE', 'TD', 'GN', 'BJ', 'TG', 'CD', 'CG', 'GA', 'MG', 'HT', 'DJ', 'CF', 'BI', 'KM'],
}
const LANG_BY_COUNTRY = Object.fromEntries(
  Object.entries(COUNTRY_LANG).flatMap(([lang, countries]) => countries.map((c) => [c, lang])),
)

// Cabeçalhos de país que os CDNs/proxies mais comuns acrescentam. Sem nenhum
// (VPS sem CDN à frente), a deteção usa só o Accept-Language — ligar o proxy
// do Cloudflare (plano gratuito) acrescenta CF-IPCountry sem mais nada.
const COUNTRY_HEADERS = ['cf-ipcountry', 'x-vercel-ip-country', 'cloudfront-viewer-country', 'x-country-code', 'x-geo-country']

// crawlers nunca são redirecionados: cada língua tem o seu URL e o Google
// descobre-os pelo hreflang/sitemap. Redirecionar o Googlebot (que rastreia a
// partir dos EUA) escondia-lhe a versão portuguesa.
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|whatsapp|telegram/i

function readCookie(req, name) {
  const header = req.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

function countryOf(req) {
  for (const h of COUNTRY_HEADERS) {
    const value = req.get(h)?.trim().toUpperCase()
    if (value && /^[A-Z]{2}$/.test(value) && value !== 'XX' && value !== 'T1') return value
  }
  return null
}

function acceptLanguageLang(req) {
  const header = req.get('accept-language') ?? ''
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.find((p) => p.trim().startsWith('q='))
      return { base: tag.toLowerCase().split('-')[0], q: q ? Number(q.trim().slice(2)) || 0 : 1 }
    })
    .filter((x) => x.base)
    .sort((a, b) => b.q - a.q)
  return ranked.find((x) => SUPPORTED_LANGS.includes(x.base))?.base ?? null
}

function detectLang(req) {
  const country = countryOf(req)
  if (country && LANG_BY_COUNTRY[country]) return LANG_BY_COUNTRY[country]
  const fromBrowser = acceptLanguageLang(req)
  if (fromBrowser) return fromBrowser
  return country ? 'en' : 'pt'
}

function hasLangPrefix(pathname) {
  const first = pathname.split('/')[1] ?? ''
  return PREFIXED_LANGS.includes(first)
}

function isPublicPage(pathname) {
  return !(pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/healthz')
}

/** Para onde mandar este pedido, ou null para o servir tal como veio. */
function langRedirectFor(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null
  const pathname = req.path
  if (!isPublicPage(pathname) || hasLangPrefix(pathname)) return null
  if (/\.[a-z0-9]+$/i.test(pathname)) return null // ficheiros (favicon, ads.txt...), não páginas
  if (BOT_UA.test(req.get('user-agent') ?? '')) return null
  const chosen = readCookie(req, LANG_COOKIE)
  const lang = SUPPORTED_LANGS.includes(chosen) ? chosen : detectLang(req)
  if (lang === 'pt') return null
  const query = req.originalUrl.slice(req.path.length)
  // slugs de artigo em pt não existem em /en/... — o SSR resolve isso com um
  // 301 para o slug traduzido (ou de volta ao pt, se ainda não houver tradução)
  return `/${lang}${pathname === '/' ? '/' : pathname}${query}`
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

if (isProduction) {
  // falha a carregar o bundle SSR fica logo visível no arranque (docker compose
  // logs web), em vez de só aparecer no primeiro pedido — o servidor continua
  // de pé a servir a SPA (ver fallback no fim)
  loadServerEntry().catch((err) => console.error('[web] bundle SSR não carregou — a servir só a SPA:', err))
}

// Qualquer erro que escape a uma rota não pode derrubar o processo (o Express 4
// não apanha promises rejeitadas; sem isto o Node termina e o container reinicia).
process.on('unhandledRejection', (err) => console.error('[web] promise rejeitada sem tratamento:', err))

app.get('/healthz', (_req, res) => {
  res.type('text/plain').send('ok')
})

// não depende do bundle SSR nem do Supabase — responde sempre
app.get('/robots.txt', (req, res) => {
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=3600')
    .send(`User-agent: *
Disallow: /admin

Sitemap: ${siteUrlFor(req)}/sitemap.xml
`)
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
  const langRedirect = langRedirectFor(req)
  if (langRedirect) {
    // decisão por visitante — nunca pode ficar em cache partilhada
    res.set('Cache-Control', 'private, no-store').set('Vary', 'Cookie, Accept-Language').redirect(302, langRedirect)
    return
  }
  try {
    const url = req.originalUrl
    const html = isProduction
      ? template
      : await vite.transformIndexHtml(url, await fs.readFile(path.join(root, 'index.html'), 'utf-8'))
    const { render } = await loadServerEntry()
    const result = await render(url, siteUrlFor(req))
    if (result.redirect) {
      res.set('Cache-Control', result.cacheControl).redirect(result.status, result.redirect)
      return
    }
    // páginas sem prefixo podiam ter sido redirecionadas conforme o visitante
    // (ver langRedirectFor) — uma cache à frente tem de as separar por isso
    if (isPublicPage(req.path) && !hasLangPrefix(req.path)) res.set('Vary', 'Cookie, Accept-Language')

    // substituições por função: com uma string, "$&"/"$'" no texto de um
    // artigo seriam interpretados como padrões especiais do replace
    const page = html
      .replace('<html lang="pt">', () => `<html lang="${result.htmlLang}">`)
      .replace('<!--app-head-->', () => result.head)
      .replace('<!--app-html-->', () => result.html)
      .replace('<!--app-state-->', () => result.state)
    res.status(result.status).set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', result.cacheControl)
    res.end(page)
  } catch (err) {
    vite?.ssrFixStacktrace(err)
    console.error(`[web] erro no SSR de ${req.originalUrl} — a servir a SPA:`, err)
    if (!template) {
      res.status(500).type('text/plain').end('Erro interno')
      return
    }
    // mesmo comportamento de antes do SSR: #root vazio, o browser renderiza sozinho
    const page = template
      .replace('<!--app-head-->', '<title>footballtrend — Notícias de Futebol</title>')
      .replace('<!--app-html-->', '')
      .replace('<!--app-state-->', '')
    res.status(200).set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'no-store').end(page)
  }
})

app.listen(port, () => {
  console.log(`[web] a servir em http://localhost:${port} (${isProduction ? 'produção' : 'dev'})`)
})
