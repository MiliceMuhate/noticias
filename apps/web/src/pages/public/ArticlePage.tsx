import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { localizedPath, parseAlternates, useLang, useT } from '../../lib/i18n'
import { articleQuery } from '../../lib/publicData'
import { articlePath, articleTitle, useDocumentTitle } from '../../lib/seo'
import { supabase } from '../../lib/supabase'
import { ArticleImage, CategoryLabel, LocalTime, PublicFooter, PublicHeader } from './PublicChrome'

/** Página pública de um artigo publicado, por slug — sem login. Ver .claude/design/design.md. */

/** Conta cada abertura da página, incluindo refresh. O temporizador é cancelado
 * no cleanup para o StrictMode não duplicar o pedido durante a hidratação. */
function useCountView(articleId: string | undefined, navigationKey: string) {
  useEffect(() => {
    if (!articleId) return
    const timer = window.setTimeout(() => {
      void supabase.rpc('increment_article_view', { p_id: articleId }).then(({ error }) => {
        if (error) console.error('Não foi possível contar a visualização:', error)
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [articleId, navigationKey])
}

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const lang = useLang()
  const t = useT()
  const { data: article, isLoading, error } = useQuery({ ...articleQuery(lang, slug ?? ''), enabled: !!slug })
  useCountView(article?.id, location.key)
  useDocumentTitle(article ? articleTitle(article) : null)
  const alternates = article ? parseAlternates(article.alternates) : undefined
  const original = lang !== 'pt' ? alternates?.find((a) => a.lang === 'pt') : undefined

  const tags = Array.isArray(article?.tags) ? (article.tags as unknown[]).filter((t): t is string => typeof t === 'string') : []

  return (
    <div className="min-h-screen bg-white font-body">
      <PublicHeader alternates={alternates} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link
          to={localizedPath(lang, '/')}
          className="mb-6 inline-flex items-center gap-1 font-display text-sm font-medium uppercase tracking-wide text-delvis-teal hover:text-delvis-teal-600"
        >
          {t('backToNews')}
        </Link>

        {isLoading && <p className="text-delvis-mute">{t('loading')}</p>}
        {error && (
          <p className="text-red-600">
            {t('error')} {(error as Error).message}
          </p>
        )}
        {!isLoading && !error && !article && <p className="text-delvis-mute">{t('articleNotFound')}</p>}

        {article && (
          <article>
            <CategoryLabel>{article.category ?? t('football')}</CategoryLabel>
            <h1 className="mt-2.5 font-display text-3xl font-semibold leading-tight text-delvis-ink sm:text-[40px]">
              {article.title ?? t('untitled')}
            </h1>
            <div className="mt-3 flex items-center gap-2.5">
              <span className="h-8 w-8 rounded-full border border-delvis-line bg-delvis-surface" />
              <span className="text-[13px] font-semibold text-delvis-ink">{article.author ?? t('newsroom')}</span>
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
                {t('photo')} {article.source_name}
              </p>
            )}

            <div className="prose prose-slate mt-7 max-w-none font-body prose-headings:font-display prose-headings:font-medium prose-headings:text-delvis-ink prose-p:text-delvis-body prose-a:font-semibold prose-a:text-delvis-teal prose-strong:text-delvis-ink">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.body}</ReactMarkdown>
            </div>

            {/* atribuição no fim do artigo (guardrail #2 — tem de aparecer sempre) */}
            {article.source_url && (
              <p className="mt-8 bg-delvis-surface px-3.5 py-2.5 text-xs font-medium text-delvis-mute">
                {t('rewrittenFrom')}{' '}
                <span className="font-bold text-delvis-ink">{article.source_name ?? t('externalSource')}</span>.{' '}
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-delvis-teal underline hover:text-delvis-teal-600"
                >
                  {t('viewOriginal')}
                </a>
                {original && (
                  <>
                    <br />
                    {t('translatedFrom')}{' '}
                    <Link
                      to={articlePath('pt', original.slug)}
                      hrefLang="pt-PT"
                      className="font-bold text-delvis-teal underline hover:text-delvis-teal-600"
                    >
                      {t('readInPortuguese')}
                    </Link>
                  </>
                )}
              </p>
            )}

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
