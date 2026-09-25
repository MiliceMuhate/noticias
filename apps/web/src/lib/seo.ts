import { useEffect } from 'react'
import type { PublishedArticle } from '@repo/shared'

/**
 * Metadados de SEO do site público. O `<head>` é montado no servidor
 * (`entry-server.tsx`) — é o que o Googlebot lê na primeira passagem, antes
 * de correr JS. No cliente só se atualiza o `<title>` nas navegações internas
 * (`useDocumentTitle`); cada URL pedido de raiz volta a passar pelo SSR.
 */

export const SITE_NAME = 'footballtrend'
export const DEFAULT_TITLE = 'footballtrend — Notícias de Futebol'
export const DEFAULT_DESCRIPTION =
  'Notícias de futebol ao minuto: transferências, resultados e análise, sempre com a fonte original indicada.'

export interface HeadData {
  title: string
  description?: string
  /** Caminho absoluto a partir da raiz (ex.: "/artigo/x"), sem domínio. */
  canonicalPath?: string
  noindex?: boolean
  ogType?: 'website' | 'article'
  image?: string | null
  publishedTime?: string | null
  jsonLd?: Record<string, unknown>
}

export function articlePath(slug: string): string {
  return `/artigo/${encodeURIComponent(slug)}`
}

export function articleTitle(article: Pick<PublishedArticle, 'title'>): string {
  return article.title ? `${article.title} | ${SITE_NAME}` : DEFAULT_TITLE
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
  meta('name', 'robots', head.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large')
  if (canonical) tags.push(`<link rel="canonical" href="${escapeHtml(canonical)}" />`)

  meta('property', 'og:site_name', SITE_NAME)
  meta('property', 'og:locale', 'pt_PT')
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
  const url = `${siteUrl}${articlePath(article.slug)}`
  const tags = Array.isArray(article.tags) ? article.tags.filter((t): t is string => typeof t === 'string') : []
  const publisher = {
    '@type': 'Organization',
    name: SITE_NAME,
    url: siteUrl,
    logo: { '@type': 'ImageObject', url: `${siteUrl}/logo.png`, width: 512, height: 512 },
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
    author: [{ '@type': 'Organization', name: article.author ?? `Redação ${SITE_NAME}`, url: siteUrl }],
    editor: article.editor ? { '@type': 'Person', name: article.editor } : undefined,
    publisher,
    articleSection: article.category ?? undefined,
    keywords: tags.length > 0 ? tags.join(', ') : undefined,
    inLanguage: 'pt',
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
