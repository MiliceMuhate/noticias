import { Link } from 'react-router-dom'
import { openConsentSettings } from '../../lib/consent'
import { localizedPath, useLang, useT } from '../../lib/i18n'
import { PublicFooter, PublicHeader } from './PublicChrome'
import { PRIVACY_CONTENT } from './privacyPolicyContent'

/** /politica-de-privacidade — sem login. O consentimento é gerido pela CMP da Google (lib/consent.ts).
 * O texto de cada língua vive em privacyPolicyContent.tsx. */

export default function PrivacyPolicy() {
  const lang = useLang()
  const t = useT()
  const content = PRIVACY_CONTENT[lang]

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
        <p className="mt-2 text-sm text-delvis-mute">{content.updated}</p>

        <div className="prose prose-slate mt-8 max-w-none font-body prose-headings:font-display prose-headings:font-medium prose-headings:text-delvis-ink prose-a:font-semibold prose-a:text-delvis-teal prose-strong:text-delvis-ink">
          <content.Body onManageCookies={openConsentSettings} />
        </div>

        <p className="mt-8 border-t border-delvis-line pt-4 text-xs text-delvis-mute">
          <button type="button" onClick={openConsentSettings} className="font-semibold text-delvis-teal underline">
            {t('manageCookies')}
          </button>
        </p>
      </main>
      <PublicFooter />
    </div>
  )
}
