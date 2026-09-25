import { useEffect } from 'react'
import type { PublishedArticle } from '@repo/shared'
import { PUBLISHER_NAME } from '../pages/public/infoPagesContent'
import { DEFAULT_LANG, HTML_LANG, type Lang, localizedPath, OG_LOCALE, parseAlternates, translate } from './i18n'

/**
 * Metadados de SEO do site público. O `<head>` é montado no servidor
 * (`entry-server.tsx`) — é o que o Googlebot lê na primeira passagem, antes
 * de correr JS. No cliente só se atualiza o `<title>` nas navegações internas
 * (`useDocumentTitle`); cada URL pedido de raiz volta a passar pelo SSR.
 */

export const SITE_NAME = 'footballtrend'

export function defaultTitle(lang: Lang): string {
  return translate(lang, 'defaultTitle')
}

export function defaultDescription(lang: Lang): string {
  return translate(lang, 'defaultDescription')
}

/** Uma versão da mesma página noutra língua — vira `<link rel="alternate" hreflang>`. */
export interface HeadAlternate {
  lang: Lang
  path: string
}

export interface HeadData {
  lang: Lang
  title: string
  description?: string
  /** Caminho absoluto a partir da raiz (ex.: "/artigo/x"), sem domínio. */
  canonicalPath?: string
  noindex?: boolean
  ogType?: 'website' | 'article'
  image?: string | null
  publishedTime?: string | null
  jsonLd?: Record<string, unknown>
  /** Todas as versões da página, incluindo a própria (o Google pede-o assim). */
  alternates?: HeadAlternate[]
}

export function articlePath(lang: Lang, slug: string): string {
  return localizedPath(lang, `/artigo/${encodeURIComponent(slug)}`)
}

export function articleTitle(article: Pick<PublishedArticle, 'title' | 'lang'>): string {
  return article.title ? `${article.title} | ${SITE_NAME}` : defaultTitle(article.lang as Lang)
}

/** Versões de um artigo noutras línguas, a partir da coluna `alternates` da view. */
export function articleAlternates(article: Pick<PublishedArticle, 'alternates'>): HeadAlternate[] {
  return parseAlternates(article.alternates).map((a) => ({ lang: a.lang, path: articlePath(a.lang, a.slug) }))
}

/** Páginas que existem em todas as línguas (início, privacidade): mesmo caminho, prefixo diferente. */
export function everyLangAlternates(path: string, langs: readonly Lang[]): HeadAlternate[] {
  return langs.map((lang) => ({ lang, path: localizedPath(lang, path) }))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** JSON dentro de `<script>`: `<` escapado para que um `</script>` vindo dos
 * dados (título, corpo do artigo) nunca feche a tag antes do tempo. */
export function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function renderHeadTags(head: HeadData, siteUrl: string): string {
  const tags: string[] = [`<title>${escapeHtml(head.title)}</title>`]
  const meta = (attr: 'name' | 'property', key: string, content: string | null | undefined) => {
    if (content) tags.push(`<meta ${attr}="${key}" content="${escapeHtml(content)}" />`)
  }
  const canonical = head.canonicalPath ? `${siteUrl}${head.canonicalPath}` : null

  meta('name', 'description', head.description)
  // Verificação do site no AdSense: o robot do Google procura o ID do editor no
  // HTML do servidor — o script do AdSense é injetado pelo browser depois de
  // hidratar (lib/adsense.ts), por isso não está lá. A meta tag não é script
  // nem cookie. Sem VITE_ADSENSE_CLIENT_ID (dev), não sai.
  meta('name', 'google-adsense-account', import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined)
  meta('name', 'robots', head.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large')
  if (canonical) tags.push(`<link rel="canonical" href="${escapeHtml(canonical)}" />`)

  if (!head.noindex && head.alternates && head.alternates.length > 1) {
    for (const alt of head.alternates) {
      tags.push(`<link rel="alternate" hreflang="${HTML_LANG[alt.lang]}" href="${escapeHtml(`${siteUrl}${alt.path}`)}" />`)
    }
    const fallback = head.alternates.find((a) => a.lang === DEFAULT_LANG)
    if (fallback) tags.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${siteUrl}${fallback.path}`)}" />`)
  }

  meta('property', 'og:site_name', SITE_NAME)
  meta('property', 'og:locale', OG_LOCALE[head.lang])
  for (const alt of head.alternates ?? []) {
    if (alt.lang !== head.lang) meta('property', 'og:locale:alternate', OG_LOCALE[alt.lang])
  }
  meta('property', 'og:type', head.ogType ?? 'website')
  meta('property', 'og:title', head.title)
  meta('property', 'og:description', head.description)
  meta('property', 'og:url', canonical)
  meta('property', 'og:image', head.image)
  meta('property', 'article:published_time', head.publishedTime)
  meta('name', 'twitter:card', head.image ? 'summary_large_image' : 'summary')

  if (head.jsonLd) {
    tags.push(`<script type="application/ld+json">${serializeForScript(head.jsonLd)}</script>`)
  }
  return tags.join('\n    ')
}

/**
 * `NewsArticle` (docs/publicador/TASKS_CONTENT.md §5.7). `author` é a
 * assinatura da redação — uma editoria, não uma pessoa (docs/publicador/AUTHORS.md
 * §1, Opção B) — por isso `Organization`; o `editor` é a pessoa real
 * responsável. `isBasedOn` aponta para a notícia original (guardrail #2).
 */
export function newsArticleJsonLd(article: PublishedArticle, siteUrl: string): Record<string, unknown> {
  const lang = article.lang as Lang
  const url = `${siteUrl}${articlePath(lang, article.slug)}`
  const tags = Array.isArray(article.tags) ? article.tags.filter((t): t is string => typeof t === 'string') : []
  // quem publica é a Pixa Editora; footballtrend é o nome do site
  const publisher = {
    '@type': 'Organization',
    name: PUBLISHER_NAME,
    url: siteUrl,
    logo: { '@type': 'ImageObject', url: `${siteUrl}/logo.png`, width: 512, height: 512 },
    publishingPrinciples: `${siteUrl}${localizedPath(lang, '/politica-editorial')}`,
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    headline: (article.title ?? '').slice(0, 110),
    description: article.seo_description ?? article.dek ?? undefined,
    image: article.media_url ? [article.media_url] : undefined,
    datePublished: article.published_at ?? undefined,
    dateModified: article.published_at ?? undefined,
    author: [{ '@type': 'Organization', name: article.author ?? `${translate(lang, 'newsroom')} ${SITE_NAME}`, url: siteUrl }],
    editor: article.editor ? { '@type': 'Person', name: article.editor } : undefined,
    publisher,
    articleSection: article.category ?? undefined,
    keywords: tags.length > 0 ? tags.join(', ') : undefined,
    inLanguage: HTML_LANG[lang],
    isBasedOn: article.source_url
      ? {
          '@type': 'NewsArticle',
          url: article.source_url,
          publisher: article.source_name ? { '@type': 'Organization', name: article.source_name } : undefined,
        }
      : undefined,
  }
}

export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
