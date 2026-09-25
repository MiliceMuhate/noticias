import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { articlesQuery } from '../../lib/publicData'
import { DEFAULT_TITLE, SITE_NAME, useDocumentTitle } from '../../lib/seo'
import { ArticleImage, CategoryLabel, LocalTime, PublicFooter, PublicHeader } from './PublicChrome'

/** Página pública de notícias — "Portal clássico" (ver .claude/design/design.md, direção 1a). */

export default function NewsList() {
  const [searchParams] = useSearchParams()
  const category = searchParams.get('categoria')
  const search = searchParams.get('q')

  const { data: articles, isLoading, error } = useQuery(articlesQuery(category, search))
  useDocumentTitle(category ? `${category} | ${SITE_NAME}` : DEFAULT_TITLE)

  const list = articles ?? []
  const [hero, ...restAfterHero] = list
  const latest = restAfterHero.slice(0, 5)
  const grid = restAfterHero.slice(5)

  return (
    <div className="min-h-screen bg-white font-body">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {(category || search) && (
          <p className="mb-6 text-sm font-medium text-delvis-mute">
            {category && (
              <>
                Categoria: <span className="font-bold text-delvis-ink">{category}</span>
              </>
            )}
            {search && (
              <>
                Resultados para "<span className="font-bold text-delvis-ink">{search}</span>"
              </>
            )}
          </p>
        )}

        {isLoading && <p className="text-delvis-mute">A carregar…</p>}
        {error && <p className="text-red-600">Erro: {(error as Error).message}</p>}

        {!isLoading && !error && list.length === 0 && (
          <div className="border border-dashed border-delvis-line py-16 text-center">
            <p className="font-display text-lg font-semibold text-delvis-ink">Ainda sem notícias por aqui</p>
            <p className="mt-1 text-sm text-delvis-mute">Volta em breve — é só esperar pelo apito inicial.</p>
          </div>
        )}

        {hero && (
          <div className="grid gap-10 pb-2 lg:grid-cols-[1.7fr_1fr]">
            <Link to={`/artigo/${hero.slug}`} className="group block">
              <ArticleImage
                src={hero.media_url}
                alt=""
                category={hero.category}
                className="aspect-[3/2] w-full object-cover"
              />
              <div className="mt-4 flex items-center gap-2.5">
                <CategoryLabel>{hero.category ?? 'Futebol'}</CategoryLabel>
                <span className="h-1 w-1 rounded-full bg-delvis-line" />
                <LocalTime iso={hero.published_at} format="relative" className="text-xs font-medium text-delvis-mute" />
              </div>
              <h1 className="mt-2.5 font-display text-3xl font-semibold leading-tight text-delvis-ink group-hover:underline sm:text-[40px]">
                {hero.title ?? '(sem título)'}
              </h1>
              {hero.seo_description && (
                <p className="mt-3 max-w-[64ch] text-base font-medium leading-relaxed text-delvis-body sm:text-[17px]">
                  {hero.seo_description}
                </p>
              )}
              <div className="mt-4 flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-full border border-delvis-line bg-delvis-surface" />
                <span className="text-[13px] font-semibold text-delvis-ink">{hero.author ?? 'Redação'}</span>
                <span className="text-[13px] font-medium text-delvis-mute">
                  · <LocalTime iso={hero.published_at} format="short" />
                </span>
              </div>
            </Link>

            {latest.length > 0 && (
              <aside className="border-delvis-line pt-2 lg:border-l lg:pl-7 lg:pt-0">
                <div className="flex items-center justify-between border-b-2 border-delvis-ink pb-3">
                  <span className="font-display text-base font-semibold uppercase tracking-wide text-delvis-ink">
                    Últimas
                  </span>
                </div>
                <div className="flex flex-col">
                  {latest.map((article, i) => (
                    <Link
                      key={article.id}
                      to={`/artigo/${article.slug}`}
                      className={`flex items-center gap-3 py-4 ${i < latest.length - 1 ? 'border-b border-delvis-line-2' : ''}`}
                    >
                      <ArticleImage
                        src={article.media_url}
                        alt=""
                        category={article.category}
                        className="h-16 w-16 shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0">
                        <LocalTime
                          iso={article.published_at}
                          format="time"
                          className="block text-xs font-medium text-delvis-mute"
                        />
                        <p className="line-clamp-2 font-display text-base font-medium leading-tight text-delvis-ink hover:underline sm:text-[17px]">
                          {article.title ?? '(sem título)'}
                        </p>
                        <span className="text-xs font-medium text-delvis-mute">{article.author ?? 'Redação'}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </aside>
            )}
          </div>
        )}

        {grid.length > 0 && (
          <div className="mt-9">
            <div className="mb-5 flex items-center gap-4">
              <span className="font-display text-lg font-semibold uppercase tracking-wide text-delvis-ink">
                Mais notícias
              </span>
              <span className="h-px flex-1 bg-delvis-line" />
            </div>
            <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {grid.map((article) => (
                <Link key={article.id} to={`/artigo/${article.slug}`} className="group flex flex-col gap-3">
                  <ArticleImage
                    src={article.media_url}
                    alt=""
                    category={article.category}
                    className="aspect-video w-full object-cover"
                  />
                  <CategoryLabel>{article.category ?? 'Futebol'}</CategoryLabel>
                  <h3 className="-mt-1 font-display text-xl font-medium leading-tight text-delvis-ink group-hover:underline">
                    {article.title ?? '(sem título)'}
                  </h3>
                  {article.seo_description && (
                    <p className="line-clamp-2 text-sm font-medium leading-relaxed text-delvis-mute">
                      {article.seo_description}
                    </p>
                  )}
                  <span className="text-xs font-medium text-delvis-mute">
                    {article.author ?? 'Redação'} · <LocalTime iso={article.published_at} format="short" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  )
}
