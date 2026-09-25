import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { dehydrate } from '@tanstack/react-query'
import App from './App'
import { articleQuery, articlesQuery, categoriesQuery, fetchSitemapEntries } from './lib/publicData'
import {
  articlePath,
  articleTitle,
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  type HeadData,
  newsArticleJsonLd,
  renderHeadTags,
  serializeForScript,
  SITE_NAME,
} from './lib/seo'
import { createQueryClient, Root } from './Root'

/**
 * Render do lado do servidor, chamado por `server.js` a cada pedido. Só o site
 * público é renderizado aqui — é o que o Google indexa. O painel /admin segue
 * como SPA (depende da sessão do operador, que só existe no browser) e sai com
 * o #root vazio + `noindex`.
 *
 * Os dados são pré-carregados com as MESMAS query keys que as páginas usam
 * (lib/publicData.ts) e enviados em `window.__RQ_STATE__`, para o cliente
 * hidratar sem novo pedido ao Supabase.
 */

export interface RenderResult {
  status: number
  head: string
  html: string
  state: string
  cacheControl: string
}

/** Páginas de categoria com menos do que isto ficam `noindex` — páginas de
 * arquivo finas (docs/publicador/TASKS_CONTENT.md §5.7). */
const THIN_ARCHIVE_THRESHOLD = 3

const PUBLIC_CACHE = 'public, max-age=60'

export async function render(url: string, siteUrl: string): Promise<RenderResult> {
  const { pathname, searchParams } = new URL(url, 'http://ssr.local')

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return {
      status: 200,
      head: renderHeadTags({ title: `Painel | ${SITE_NAME}`, noindex: true }, siteUrl),
      html: '',
      state: '',
      cacheControl: 'no-store',
    }
  }

  const queryClient = createQueryClient()
  let status = 200
  let head: HeadData

  try {
    await queryClient.fetchQuery(categoriesQuery())

    const articleMatch = /^\/artigo\/([^/]+)\/?$/.exec(pathname)
    if (pathname === '/') {
      const category = searchParams.get('categoria')
      const search = searchParams.get('q')
      const articles = await queryClient.fetchQuery(articlesQuery(category, search))
      head = category
        ? {
            title: `${category} | ${SITE_NAME}`,
            description: `Últimas notícias de futebol sobre ${category}.`,
            canonicalPath: `/?categoria=${encodeURIComponent(category)}`,
            noindex: !!search || articles.length < THIN_ARCHIVE_THRESHOLD,
          }
        : {
            title: DEFAULT_TITLE,
            description: DEFAULT_DESCRIPTION,
            canonicalPath: '/',
            // resultados de pesquisa: rastreáveis (os links seguem), nunca indexados
            noindex: !!search,
          }
    } else if (articleMatch) {
      const slug = safeDecode(articleMatch[1]!)
      const article = slug === null ? null : await queryClient.fetchQuery(articleQuery(slug))
      if (article) {
        head = {
          title: articleTitle(article),
          description: article.seo_description ?? article.dek ?? DEFAULT_DESCRIPTION,
          canonicalPath: articlePath(article.slug),
          ogType: 'article',
          image: article.media_url,
          publishedTime: article.published_at,
          jsonLd: newsArticleJsonLd(article, siteUrl),
        }
      } else {
        status = 404
        head = { title: `Artigo não encontrado | ${SITE_NAME}`, noindex: true }
      }
    } else if (pathname === '/politica-de-privacidade') {
      head = {
        title: `Política de privacidade | ${SITE_NAME}`,
        description: 'Como o footballtrend usa cookies, Google Analytics e Google AdSense.',
        canonicalPath: '/politica-de-privacidade',
      }
    } else {
      status = 404
      head = { title: `Página não encontrada | ${SITE_NAME}`, noindex: true }
    }
  } catch (err) {
    // Supabase indisponível: em vez de um 500, manda a SPA vazia — o browser
    // renderiza sozinho (e tenta outra vez os pedidos), como antes do SSR.
    console.error(`[ssr] falha a carregar dados para ${url}:`, err)
    return {
      status: 200,
      head: renderHeadTags({ title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION }, siteUrl),
      html: '',
      state: '',
      cacheControl: 'no-store',
    }
  }

  const html = renderToString(
    <Root queryClient={queryClient}>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </Root>,
  )

  return {
    status,
    head: renderHeadTags(head, siteUrl),
    html,
    state: `<script>window.__RQ_STATE__=${serializeForScript(dehydrate(queryClient))}</script>`,
    cacheControl: status === 200 ? PUBLIC_CACHE : 'no-store',
  }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null // "%E0%A4%A" e afins — URL malformado, não é um slug que exista
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function renderSitemap(siteUrl: string): Promise<string> {
  const entries = await fetchSitemapEntries()
  const urls = [
    `  <url><loc>${escapeXml(`${siteUrl}/`)}</loc><changefreq>hourly</changefreq></url>`,
    ...entries.map((entry) => {
      const loc = escapeXml(`${siteUrl}${articlePath(entry.slug)}`)
      const lastmod = entry.published_at ? `<lastmod>${escapeXml(entry.published_at)}</lastmod>` : ''
      return `  <url><loc>${loc}</loc>${lastmod}</url>`
    }),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
}

export function renderRobots(siteUrl: string): string {
  return `User-agent: *
Disallow: /admin

Sitemap: ${siteUrl}/sitemap.xml
`
}
