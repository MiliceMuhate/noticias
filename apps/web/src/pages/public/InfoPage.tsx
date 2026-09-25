import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { localizedPath, useLang, useT } from '../../lib/i18n'
import { editorQuery } from '../../lib/publicData'
import { SITE_NAME, useDocumentTitle } from '../../lib/seo'
import { INFO_PAGES, type InfoPageKey } from './infoPagesContent'
import { PublicFooter, PublicHeader } from './PublicChrome'

/** /sobre, /contacto, /politica-editorial — sem login. Texto em infoPagesContent.tsx. */
export default function InfoPage({ page }: { page: InfoPageKey }) {
  const lang = useLang()
  const t = useT()
  const content = INFO_PAGES[page][lang]
  // o editor responsável vive em settings.authors (só operadores leem) — o
  // site público vê-o pela view published_articles, como em cada artigo
  const { data: editor } = useQuery(editorQuery())
  useDocumentTitle(`${content.title} | ${SITE_NAME}`)

  return (
    <div className="min-h-screen bg-white font-body">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link
          to={localizedPath(lang, '/')}
          className="mb-6 inline-flex items-center gap-1 font-display text-sm font-medium uppercase tracking-wide text-delvis-teal hover:text-delvis-teal-600"
        >
          {t('backToNews')}
        </Link>
        <h1 className="font-display text-3xl font-semibold text-delvis-ink">{content.title}</h1>
        <div className="prose prose-slate mt-8 max-w-none font-body prose-headings:font-display prose-headings:font-medium prose-headings:text-delvis-ink prose-a:font-semibold prose-a:text-delvis-teal prose-strong:text-delvis-ink">
          <content.Body editor={editor ?? null} />
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}
