import { useState } from 'react'
import { useHydrated } from '../../lib/hydration'
import { useT } from '../../lib/i18n'

/**
 * Partilha de um artigo. Tudo são botões com onClick (nada de href com o URL):
 * o servidor (SSR) não sabe o URL absoluto nem se o browser tem partilha
 * nativa, e o HTML do servidor tem de ser igual ao do primeiro render do
 * cliente. O botão nativo (navigator.share — menu de partilha do telemóvel)
 * só aparece depois de hidratar, e só onde existe.
 */

const NETWORKS: { key: string; label: string; url: (u: string, title: string) => string; className: string }[] = [
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    url: (u, title) => `https://wa.me/?text=${encodeURIComponent(`${title} ${u}`)}`,
    className: 'hover:border-[#25D366] hover:text-[#128C7E]',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    url: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
    className: 'hover:border-[#1877F2] hover:text-[#1877F2]',
  },
  {
    key: 'x',
    label: 'X',
    url: (u, title) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(title)}`,
    className: 'hover:border-delvis-ink hover:text-delvis-ink',
  },
  {
    key: 'telegram',
    label: 'Telegram',
    url: (u, title) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(title)}`,
    className: 'hover:border-[#229ED9] hover:text-[#229ED9]',
  },
]

const chip =
  'inline-flex items-center gap-1.5 rounded-full border border-delvis-line px-3 py-1.5 text-xs font-semibold text-delvis-mute transition-colors'

export default function ShareButtons({ title }: { title: string }) {
  const t = useT()
  const hydrated = useHydrated()
  const [copied, setCopied] = useState(false)
  const canShareNatively = hydrated && typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const currentUrl = () => window.location.href.split('#')[0]!

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(currentUrl())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard bloqueado (http, permissões) — mostra o URL para copiar à mão
      window.prompt(t('copyLink'), currentUrl())
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t('shareArticle')} role="group">
      <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.16em] text-delvis-mute">{t('share')}</span>
      {canShareNatively && (
        <button
          type="button"
          onClick={() => void navigator.share({ title, url: currentUrl() }).catch(() => {})}
          className={`${chip} border-delvis-ink bg-delvis-ink text-white hover:bg-delvis-teal`}
        >
          <ShareIcon /> {t('share')}
        </button>
      )}
      {NETWORKS.map((n) => (
        <button
          key={n.key}
          type="button"
          onClick={() => window.open(n.url(currentUrl(), title), '_blank', 'noopener,noreferrer,width=640,height=560')}
          className={`${chip} ${n.className}`}
        >
          {n.label}
        </button>
      ))}
      <button type="button" onClick={() => void copyLink()} className={`${chip} hover:border-delvis-teal hover:text-delvis-teal`}>
        {copied ? `✓ ${t('linkCopied')}` : t('copyLink')}
      </button>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" />
    </svg>
  )
}
