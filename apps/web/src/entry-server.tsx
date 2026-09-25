import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { dehydrate } from '@tanstack/react-query'
import App from './App'
import { HTML_LANG, type Lang, langFromPath, LANGS, localizedPath, parseAlternates, stripLang, translate } from './lib/i18n'
import {
  articleQuery,
  articlesQuery,
  categoriesQuery,
  editorQuery,
  fetchSitemapEntries,
  findArticleInAnyLang,
} from './lib/publicData'
import {
  articleAlternates,
  articlePath,
  articleTitle,
  defaultDescription,
  defaultTitle,
  everyLangAlternates,
  type HeadData,
  newsArticleJsonLd,
  renderHeadTags,
  serializeForScript,
  SITE_NAME,
} from './lib/seo'
import { createQueryClient, Root } from './Root'
import { INFO_PAGE_PATHS, INFO_PAGES, type InfoPageKey } from './pages/public/infoPagesContent'

/**
 * Render do lado do servidor, chamado por `server.js` a cada pedido. Só o site
 * público é renderizado aqui — é o que o Google indexa. O painel /admin segue
 * como SPA (depende da sessão do operador, que só existe no browser) e sai com
 * o #root vazio + `noindex`.
 *
 * Os dados são pré-carregados com as MESMAS query keys que as páginas usam
 * (lib/publicData.ts) e enviados em `window.__RQ_STATE__`, para o cliente
 * hidratar sem novo pedido ao Supabase.
 *
 * Língua: vem do prefixo do URL (lib/i18n.ts). A escolha de qual prefixo
 * mostrar a um visitante novo é feita antes, em server.js.
 */

export interface RenderResult {
  status: number
  head: string
  html: string
  state: string
  cacheControl: string
  /** valor para `<html lang>` */
  htmlLang: string
  /** quando definido, server.js responde 301 para aqui em vez de renderizar */
  redirect?: string
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
      head: renderHeadTags({ lang: 'pt', title: `Painel | ${SITE_NAME}`, noindex: true }, siteUrl),
      html: '',
      state: '',
      cacheControl: 'no-store',
      htmlLang: HTML_LANG.pt,
    }
  }

  const lang = langFromPath(pathname)
  const path = stripLang(pathname)
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) => translate(lang, key, vars)

  const queryClient = createQueryClient()
  let status = 200
  let head: HeadData

  try {
    await queryClient.fetchQuery(categoriesQuery(lang))

    const articleMatch = /^\/artigo\/([^/]+)\/?$/.exec(path)
    if (path === '/') {
      const category = searchParams.get('categoria')
      const search = searchParams.get('q')
      const articles = await queryClient.fetchQuery(articlesQuery(lang, category, search))
      head = category
        ? {
            lang,
            title: `${category} | ${SITE_NAME}`,
            description: t('categoryDescription', { category }),
            canonicalPath: `${localizedPath(lang, '/')}?categoria=${encodeURIComponent(category)}`,
            noindex: !!search || articles.length < THIN_ARCHIVE_THRESHOLD,
          }
        : {
            lang,
            title: defaultTitle(lang),
            description: defaultDescription(lang),
            canonicalPath: localizedPath(lang, '/'),
            // resultados de pesquisa: rastreáveis (os links seguem), nunca indexados
            noindex: !!search,
            alternates: everyLangAlternates('/', LANGS),
          }
    } else if (articleMatch) {
      const slug = safeDecode(articleMatch[1]!)
      const article = slug === null ? null : await queryClient.fetchQuery(articleQuery(lang, slug))
      if (article) {
        head = {
          lang,
          title: articleTitle(article),
          description: article.seo_description ?? article.dek ?? defaultDescription(lang),
          canonicalPath: articlePath(lang, article.slug),
          ogType: 'article',
          image: article.media_url,
          publishedTime: article.published_at,
          jsonLd: newsArticleJsonLd(article, siteUrl),
          alternates: articleAlternates(article),
        }
      } else {
        const redirect = slug === null ? null : await redirectForSlug(slug, lang)
        if (redirect) {
          return {
            status: 301,
            head: '',
            html: '',
            state: '',
            cacheControl: 'public, max-age=300',
            htmlLang: HTML_LANG[lang],
            redirect,
          }
        }
        status = 404
        head = { lang, title: `${t('articleNotFound').replace(/\.$/, '')} | ${SITE_NAME}`, noindex: true }
      }
    } else if (infoPageFor(path)) {
      const page = infoPageFor(path)!
      await queryClient.fetchQuery(editorQuery())
      const content = INFO_PAGES[page][lang]
      head = {
        lang,
        title: `${content.title} | ${SITE_NAME}`,
        description: content.description,
        canonicalPath: localizedPath(lang, INFO_PAGE_PATHS[page]),
        alternates: everyLangAlternates(INFO_PAGE_PATHS[page], LANGS),
      }
    } else if (path === '/politica-de-privacidade') {
      head = {
        lang,
        title: `${t('privacyPolicy')} | ${SITE_NAME}`,
        description: t('privacyDescription'),
        canonicalPath: localizedPath(lang, '/politica-de-privacidade'),
        alternates: everyLangAlternates('/politica-de-privacidade', LANGS),
      }
    } else {
      status = 404
      head = { lang, title: `${t('pageNotFound')} | ${SITE_NAME}`, noindex: true }
    }
  } catch (err) {
    // Supabase indisponível: em vez de um 500, manda a SPA vazia — o browser
    // renderiza sozinho (e tenta outra vez os pedidos), como antes do SSR.
    console.error(`[ssr] falha a carregar dados para ${url}:`, err)
    return {
      status: 200,
      head: renderHeadTags({ lang, title: defaultTitle(lang), description: defaultDescription(lang) }, siteUrl),
      html: '',
      state: '',
      cacheControl: 'no-store',
      htmlLang: HTML_LANG[lang],
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
    htmlLang: HTML_LANG[lang],
  }
}

/**
 * Slug que não existe nesta língua mas existe noutra: vai para a versão desta
 * língua se houver; senão, para a versão pt (o artigo ainda não foi traduzido
 * — melhor lê-lo em português do que um 404).
 */
async function redirectForSlug(slug: string, lang: Lang): Promise<string | null> {
  const found = await findArticleInAnyLang(slug)
  if (!found) return null
  const alternates = parseAlternates(found.alternates)
  const target = alternates.find((a) => a.lang === lang) ?? alternates.find((a) => a.lang === 'pt')
  if (!target || (target.lang === lang && target.slug === slug)) return null
  return articlePath(target.lang, target.slug)
}

function infoPageFor(path: string): InfoPageKey | null {
  const clean = path.replace(/\/+$/, '') || '/'
  return (Object.keys(INFO_PAGE_PATHS) as InfoPageKey[]).find((k) => INFO_PAGE_PATHS[k] === clean) ?? null
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

function xhtmlLinks(siteUrl: string, alternates: { lang: Lang; path: string }[]): string {
  if (alternates.length < 2) return ''
  return alternates
    .map((a) => `<xhtml:link rel="alternate" hreflang="${HTML_LANG[a.lang]}" href="${escapeXml(`${siteUrl}${a.path}`)}"/>`)
    .join('')
}

export async function renderSitemap(siteUrl: string): Promise<string> {
  const entries = await fetchSitemapEntries()
  const homeAlternates = everyLangAlternates('/', LANGS)
  const staticPages = [...Object.values(INFO_PAGE_PATHS), '/politica-de-privacidade'].map((p) => everyLangAlternates(p, LANGS))
  const urls = [
    ...homeAlternates.map(
      (home) =>
        `  <url><loc>${escapeXml(`${siteUrl}${home.path}`)}</loc>${xhtmlLinks(siteUrl, homeAlternates)}<changefreq>hourly</changefreq></url>`,
    ),
    ...staticPages.flatMap((alternates) =>
      alternates.map((page) => `  <url><loc>${escapeXml(`${siteUrl}${page.path}`)}</loc>${xhtmlLinks(siteUrl, alternates)}</url>`),
    ),
    ...entries.map((entry) => {
      const lang = entry.lang as Lang
      const loc = escapeXml(`${siteUrl}${articlePath(lang, entry.slug)}`)
      const lastmod = entry.published_at ? `<lastmod>${escapeXml(entry.published_at)}</lastmod>` : ''
      return `  <url><loc>${loc}</loc>${xhtmlLinks(siteUrl, articleAlternates(entry))}${lastmod}</url>`
    }),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
}
