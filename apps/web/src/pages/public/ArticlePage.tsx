import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { articleQuery } from '../../lib/publicData'
import { articleTitle, useDocumentTitle } from '../../lib/seo'
import { supabase } from '../../lib/supabase'
import { ArticleImage, CategoryLabel, LocalTime, PublicFooter, PublicHeader } from './PublicChrome'

/** Página pública de um artigo publicado, por slug — sem login. Ver .claude/design/design.md. */

/** 1 contagem por artigo por separador (sessionStorage) — evita que um refresh
 * ou re-render infle a contagem sozinho. Falha em silêncio: contar visitas
 * nunca deve impedir a leitura do artigo. */
function useCountView(articleId: string | undefined) {
  useEffect(() => {
    if (!articleId) return
    try {
      const key = `viewed:${articleId}`
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // sessionStorage indisponível (privado/bloqueado) — conta sempre, sem deduplicar
    }
    void supabase.rpc('increment_article_view', { p_id: articleId })
  }, [articleId])
}

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: article, isLoading, error } = useQuery({ ...articleQuery(slug ?? ''), enabled: !!slug })
  useCountView(article?.id)
  useDocumentTitle(article ? articleTitle(article) : null)

  const tags = Array.isArray(article?.tags) ? (article.tags as unknown[]).filter((t): t is string => typeof t === 'string') : []

  return (
    <div className="min-h-screen bg-white font-body">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1 font-display text-sm font-medium uppercase tracking-wide text-delvis-teal hover:text-delvis-teal-600"
        >
          ← Notícias de futebol
        </Link>

        {isLoading && <p className="text-delvis-mute">A carregar…</p>}
        {error && <p className="text-red-600">Erro: {(error as Error).message}</p>}
        {!isLoading && !error && !article && <p className="text-delvis-mute">Artigo não encontrado.</p>}

        {article && (
          <article>
            <CategoryLabel>{article.category ?? 'Futebol'}</CategoryLabel>
            <h1 className="mt-2.5 font-display text-3xl font-semibold leading-tight text-delvis-ink sm:text-[40px]">
              {article.title ?? '(sem título)'}
            </h1>
            <div className="mt-3 flex items-center gap-2.5">
              <span className="h-8 w-8 rounded-full border border-delvis-line bg-delvis-surface" />
              <span className="text-[13px] font-semibold text-delvis-ink">{article.author ?? 'Redação'}</span>
              {article.published_at && (
                <span className="text-[13px] font-medium text-delvis-mute">
                  · <LocalTime iso={article.published_at} format="long" />
                </span>
              )}
            </div>

            <ArticleImage
              src={article.media_url}
              alt=""
              category={article.category}
              className="mt-6 aspect-[3/2] w-full object-cover"
            />
            {article.media_url && article.source_name && (
              <p className="mt-2.5 border-l-2 border-delvis-line pl-2.5 text-xs font-medium text-delvis-mute">
                Foto: {article.source_name}
              </p>
            )}

            {article.source_url && (
              <p className="mt-6 bg-delvis-surface px-3.5 py-2.5 text-xs font-medium text-delvis-mute">
                Reformulado a partir de notícia publicada por{' '}
                <span className="font-bold text-delvis-ink">{article.source_name ?? 'fonte externa'}</span>.{' '}
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-delvis-teal underline hover:text-delvis-teal-600"
                >
                  Ver artigo original ↗
                </a>
              </p>
            )}

            <div className="prose prose-slate mt-7 max-w-none font-body prose-headings:font-display prose-headings:font-medium prose-headings:text-delvis-ink prose-p:text-delvis-body prose-a:font-semibold prose-a:text-delvis-teal prose-strong:text-delvis-ink">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.body}</ReactMarkdown>
            </div>

            {tags.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2 border-t border-delvis-line pt-6">
                {tags.map((tag) => (
                  <span key={tag} className="bg-delvis-surface px-2.5 py-1 text-xs font-semibold text-delvis-teal">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </article>
        )}
      </main>
      <PublicFooter />
    </div>
  )
}
