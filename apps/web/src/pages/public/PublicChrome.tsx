import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAdSense } from '../../lib/adsense'
import { useAnalytics } from '../../lib/analytics'
import { openConsentSettings } from '../../lib/consent'
import { useHydrated } from '../../lib/hydration'
import {
  type Alternate,
  HTML_LANG,
  isLang,
  type Lang,
  LANG_LABEL,
  LANGS,
  localizedPath,
  rememberLang,
  stripLang,
  translate,
  useLang,
  useT,
} from '../../lib/i18n'
import { categoriesQuery, sanitizeSearchTerm } from '../../lib/publicData'
import { PUBLISHER_NAME } from './infoPagesContent'

/**
 * Moldura visual partilhada do site público — Delvis Design System,
 * direção "1a — Portal clássico" (ver .claude/design/design.md).
 */

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatHeaderDate(date: Date, lang: Lang): string {
  const parts = date.toLocaleDateString(HTML_LANG[lang], { weekday: 'long', day: 'numeric', month: 'long' })
  if (lang !== 'pt') return capitalize(parts)
  return parts.replace(/(^|de )([a-zà-ú]+)/g, (_m, p1: string, p2: string) => p1 + capitalize(p2))
}

function formatRelative(iso: string, lang: Lang): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return translate(lang, 'justNow')
  const rtf = new Intl.RelativeTimeFormat(HTML_LANG[lang], { numeric: 'always', style: 'short' })
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  return rtf.format(-Math.round(hours / 24), 'day')
}

const DATE_FORMATS = {
  time: { hour: '2-digit', minute: '2-digit' },
  short: { day: 'numeric', month: 'short' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>

type DateFormat = keyof typeof DATE_FORMATS | 'relative'

function formatDate(iso: string, format: DateFormat, lang: Lang, timeZone?: string): string {
  if (format === 'relative') return formatRelative(iso, lang)
  const date = new Date(iso)
  const options = { ...DATE_FORMATS[format], timeZone }
  const locale = HTML_LANG[lang]
  return format === 'time' ? date.toLocaleTimeString(locale, options) : date.toLocaleDateString(locale, options)
}

/**
 * Data de publicação no fuso do leitor. O servidor (SSR) não sabe esse fuso —
 * corre em UTC — nem a que horas o HTML vai ser lido, por isso até hidratar
 * mostra a data fixa em UTC ("relative" vira "short") e só depois a versão
 * local. Sem isto, o texto do servidor e o do cliente divergiam e o React
 * deitava fora o HTML do servidor.
 */
export function LocalTime({
  iso,
  format,
  className,
}: {
  iso: string | null
  format: DateFormat
  className?: string
}) {
  const hydrated = useHydrated()
  const lang = useLang()
  if (!iso) return null
  const text = hydrated
    ? formatDate(iso, format, lang)
    : formatDate(iso, format === 'relative' ? 'short' : format, lang, 'UTC')
  return (
    <time
      dateTime={iso}
      className={className}
      title={hydrated && format === 'relative' ? formatDate(iso, 'short', lang) : undefined}
    >
      {text}
    </time>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5d7b82" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  )
}

/**
 * Seletor de língua. Guarda a escolha no cookie `lang` (server.js deixa de
 * detetar a partir daí) e vai para a mesma página na outra língua: num
 * artigo, a sua tradução (`alternates`); se ainda não houver tradução, o
 * início dessa língua.
 */
function LanguageSwitcher({ alternates }: { alternates?: Alternate[] }) {
  const lang = useLang()
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()

  function targetFor(next: Lang): string {
    if (alternates) {
      const alt = alternates.find((a) => a.lang === next)
      return alt ? localizedPath(next, `/artigo/${encodeURIComponent(alt.slug)}`) : localizedPath(next, '/')
    }
    return localizedPath(next, stripLang(location.pathname)) + location.search
  }

  return (
    <label className="flex items-center">
      <span className="sr-only">{t('language')}</span>
      <select
        value={lang}
        onChange={(e) => {
          const next = e.target.value
          if (!isLang(next) || next === lang) return
          rememberLang(next)
          navigate(targetFor(next))
        }}
        className="rounded-full border border-delvis-line bg-white px-2.5 py-1.5 text-xs font-semibold uppercase text-delvis-ink focus:outline-none"
      >
        {LANGS.map((l) => (
          <option key={l} value={l} lang={HTML_LANG[l]}>
            {l.toUpperCase()} · {LANG_LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PublicHeader({ alternates }: { alternates?: Alternate[] } = {}) {
  // só no site público — nunca no painel /admin. O consentimento é pedido pela
  // CMP da Google, que vem com o script do AdSense (ver lib/consent.ts)
  useAdSense()
  useAnalytics()
  const lang = useLang()
  const t = useT()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const activeCategory = searchParams.get('categoria')
  const { data: categories } = useQuery(categoriesQuery(lang))
  const hydrated = useHydrated()
  const today = hydrated ? formatHeaderDate(new Date(), lang) : ''
  const home = localizedPath(lang, '/')

  function handleSearch(event: FormEvent) {
    event.preventDefault()
    const term = sanitizeSearchTerm(query)
    navigate(term ? `${home}?q=${encodeURIComponent(term)}` : home)
    setMobileSearchOpen(false)
  }

  return (
    <>
      <header className="sticky top-0 z-10 bg-white font-body">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
        <Link to={home} className="flex items-baseline gap-3">
          <span className="font-display text-xl font-bold uppercase tracking-wide text-delvis-ink sm:text-2xl">
            footballtrend
          </span>
          <span className="hidden text-[11px] font-bold uppercase tracking-[0.18em] text-delvis-mute md:inline">
            {t('tagline')}
          </span>
        </Link>
        <div className="flex items-center gap-3.5">
          <form
            onSubmit={handleSearch}
            className="hidden items-center gap-2 rounded-full border border-delvis-line px-3.5 py-2 sm:flex"
          >
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="w-40 bg-transparent text-[13px] font-medium text-delvis-ink placeholder:text-delvis-mute focus:outline-none"
            />
          </form>
          <button
            type="button"
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label={mobileSearchOpen ? t('closeSearch') : t('searchPlaceholder')}
            aria-expanded={mobileSearchOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-delvis-line text-delvis-ink sm:hidden"
          >
            {mobileSearchOpen ? '✕' : <SearchIcon />}
          </button>
          <LanguageSwitcher alternates={alternates} />
          <span className="hidden text-xs font-medium capitalize text-delvis-mute lg:inline">{today}</span>
        </div>
      </div>

      {mobileSearchOpen && (
        <form onSubmit={handleSearch} className="border-t border-delvis-line px-4 py-2.5 sm:hidden">
          <div className="flex items-center gap-2 rounded-full border border-delvis-line px-3.5 py-2">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              autoFocus
              className="w-full bg-transparent text-[13px] font-medium text-delvis-ink placeholder:text-delvis-mute focus:outline-none"
            />
          </div>
        </form>
      )}

      <nav className="border-b-2 border-delvis-ink">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-1 overflow-x-auto">
            <Link
              to={home}
              className={`shrink-0 whitespace-nowrap px-3.5 py-2.5 font-display text-[13px] font-medium uppercase tracking-wide ${
                !activeCategory ? 'bg-delvis-ink text-white' : 'text-delvis-ink hover:text-delvis-teal'
              }`}
            >
              {t('home')}
            </Link>
            {(categories ?? []).map((category) => (
              <Link
                key={category}
                to={`${home}?categoria=${encodeURIComponent(category)}`}
                className={`shrink-0 whitespace-nowrap px-3.5 py-2.5 font-display text-[13px] font-medium uppercase tracking-wide ${
                  activeCategory === category ? 'bg-delvis-ink text-white' : 'text-delvis-ink hover:text-delvis-teal'
                }`}
              >
                {category}
              </Link>
            ))}
          </div>
          <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-delvis-cyan sm:inline">
            {t('live')}
          </span>
        </div>
      </nav>
      </header>
    </>
  )
}

export function PublicFooter() {
  const lang = useLang()
  const t = useT()
  return (
    <footer className="border-t border-delvis-line bg-delvis-surface py-6 font-body">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 text-xs text-delvis-mute sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-bold text-delvis-ink">footballtrend</span> — {t('footerText')} © {new Date().getFullYear()}{' '}
          {PUBLISHER_NAME}
        </p>
        <div className="flex flex-wrap gap-4 font-semibold">
          <Link to={localizedPath(lang, '/sobre')} className="hover:text-delvis-teal hover:underline">
            {t('about')}
          </Link>
          <Link to={localizedPath(lang, '/contacto')} className="hover:text-delvis-teal hover:underline">
            {t('contact')}
          </Link>
          <Link to={localizedPath(lang, '/politica-editorial')} className="hover:text-delvis-teal hover:underline">
            {t('editorialPolicy')}
          </Link>
          <Link to={localizedPath(lang, '/politica-de-privacidade')} className="hover:text-delvis-teal hover:underline">
            {t('privacyPolicy')}
          </Link>
          <button type="button" onClick={openConsentSettings} className="hover:text-delvis-teal hover:underline">
            {t('manageCookies')}
          </button>
        </div>
      </div>
    </footer>
  )
}

export function CategoryLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-delvis-teal">{children}</span>
  )
}

/**
 * Imagem do artigo original (og:image da fonte, hotlinked — ver
 * apps/api/app/services/source_article.py). Sem imagem, ou se a fonte
 * bloquear hotlinking, mostra o bloco de fallback com o rótulo da categoria
 * em vez de esconder o espaço (ver design.md §5).
 */
export function ArticleImage({
  src,
  alt,
  category,
  className,
}: {
  src: string | null
  alt: string
  category: string | null
  className: string
}) {
  const [failed, setFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const t = useT()
  // Com SSR o browser começa a carregar a imagem antes de o React hidratar — se
  // falhar nesse intervalo, o onError já disparou sem ninguém a ouvir.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [src])
  if (src && !failed) {
    return (
      <img ref={imgRef} src={src} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />
    )
  }
  return (
    <div className={`flex items-center justify-center bg-delvis-placeholder ${className}`}>
      <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-delvis-mute">
        {category ?? t('football')}
      </span>
    </div>
  )
}
