import { Link } from 'react-router-dom'
import { localizedPath, useLang, useT } from '../../lib/i18n'
import { PublicFooter, PublicHeader } from './PublicChrome'

/** URL sem rota — o servidor (entry-server.tsx) responde 404 com esta página. */
export default function NotFound() {
  const lang = useLang()
  const t = useT()
  return (
    <div className="min-h-screen bg-white font-body">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <p className="font-display text-lg font-semibold text-delvis-ink">{t('pageNotFound')}</p>
        <p className="mt-1 text-sm text-delvis-mute">{t('pageNotFoundText')}</p>
        <Link
          to={localizedPath(lang, '/')}
          className="mt-6 inline-block font-display text-sm font-medium uppercase tracking-wide text-delvis-teal hover:text-delvis-teal-600"
        >
          {t('backToNews')}
        </Link>
      </main>
      <PublicFooter />
    </div>
  )
}
