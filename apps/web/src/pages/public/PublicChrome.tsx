import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAdSense } from '../../lib/adsense'
import { useAnalytics } from '../../lib/analytics'
import { useConsent } from '../../lib/consent'
import { useHydrated } from '../../lib/hydration'
import { categoriesQuery, sanitizeSearchTerm } from '../../lib/publicData'

/**
 * Moldura visual partilhada do site público — Delvis Design System,
 * direção "1a — Portal clássico" (ver .claude/design/design.md).
 */

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatHeaderDate(date: Date): string {
  const parts = date.toLocaleDateString('pt', { weekday: 'long', day: 'numeric', month: 'long' })
  return parts.replace(/(^|de )([a-zà-ú]+)/g, (_m, p1: string, p2: string) => p1 + capitalize(p2))
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'agora mesmo'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} hora${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `há ${days} dia${days === 1 ? '' : 's'}`
}

const DATE_FORMATS = {
  time: { hour: '2-digit', minute: '2-digit' },
  short: { day: 'numeric', month: 'short' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>

type DateFormat = keyof typeof DATE_FORMATS | 'relative'

function formatDate(iso: string, format: DateFormat, timeZone?: string): string {
  if (format === 'relative') return formatRelative(iso)
  const date = new Date(iso)
  const options = { ...DATE_FORMATS[format], timeZone }
  return format === 'time' ? date.toLocaleTimeString('pt', options) : date.toLocaleDateString('pt', options)
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
  if (!iso) return null
  const text = hydrated ? formatDate(iso, format) : formatDate(iso, format === 'relative' ? 'short' : format, 'UTC')
  return (
    <time
      dateTime={iso}
      className={className}
      title={hydrated && format === 'relative' ? formatDate(iso, 'short') : undefined}
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

export function PublicHeader() {
  const consent = useConsent()
  useAdSense(consent.granted) // só carrega no site público — nunca no painel /admin — e só com consentimento
  useAnalytics(consent.granted) // idem
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const activeCategory = searchParams.get('categoria')
  const { data: categories } = useQuery(categoriesQuery())
  const hydrated = useHydrated()
  const today = hydrated ? formatHeaderDate(new Date()) : ''

  function handleSearch(event: FormEvent) {
    event.preventDefault()
    const term = sanitizeSearchTerm(query)
    navigate(term ? `/?q=${encodeURIComponent(term)}` : '/')
    setMobileSearchOpen(false)
  }

  return (
    <>
      <header className="sticky top-0 z-10 bg-white font-body">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
        <Link to="/" className="flex items-baseline gap-3">
          <span className="font-display text-xl font-bold uppercase tracking-wide text-delvis-ink sm:text-2xl">
            footballtrend
          </span>
          <span className="hidden text-[11px] font-bold uppercase tracking-[0.18em] text-delvis-mute md:inline">
            Notícias de futebol
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
              placeholder="Pesquisar notícias"
              aria-label="Pesquisar notícias"
              className="w-40 bg-transparent text-[13px] font-medium text-delvis-ink placeholder:text-delvis-mute focus:outline-none"
            />
          </form>
          <button
            type="button"
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label={mobileSearchOpen ? 'Fechar pesquisa' : 'Pesquisar notícias'}
            aria-expanded={mobileSearchOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-delvis-line text-delvis-ink sm:hidden"
          >
            {mobileSearchOpen ? '✕' : <SearchIcon />}
          </button>
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
              placeholder="Pesquisar notícias"
              aria-label="Pesquisar notícias"
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
              to="/"
              className={`shrink-0 whitespace-nowrap px-3.5 py-2.5 font-display text-[13px] font-medium uppercase tracking-wide ${
                !activeCategory ? 'bg-delvis-ink text-white' : 'text-delvis-ink hover:text-delvis-teal'
              }`}
            >
              Início
            </Link>
            {(categories ?? []).map((category) => (
              <Link
                key={category}
                to={`/?categoria=${encodeURIComponent(category)}`}
                className={`shrink-0 whitespace-nowrap px-3.5 py-2.5 font-display text-[13px] font-medium uppercase tracking-wide ${
                  activeCategory === category ? 'bg-delvis-ink text-white' : 'text-delvis-ink hover:text-delvis-teal'
                }`}
              >
                {category}
              </Link>
            ))}
          </div>
          <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-delvis-cyan sm:inline">
            Ao minuto
          </span>
        </div>
      </nav>
      </header>
      {consent.status === null && <CookieBanner onAccept={consent.accept} onReject={consent.reject} />}
    </>
  )
}

function CookieBanner({ onAccept, onReject }: { onAccept: () => void; onReject: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Preferências de cookies"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-delvis-line bg-white px-4 py-4 shadow-[0_-4px_16px_rgba(15,30,35,0.12)] sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium leading-relaxed text-delvis-mute sm:max-w-2xl">
          Usamos cookies para estatísticas de visitas (Google Analytics) e para anúncios (Google AdSense). Só
          carregam depois de aceitares.{' '}
          <Link to="/politica-de-privacidade" className="font-semibold text-delvis-teal underline hover:text-delvis-teal-600">
            Saber mais
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={onReject}
            className="rounded-md border border-delvis-line px-4 py-2 text-xs font-semibold text-delvis-ink hover:bg-delvis-surface"
          >
            Rejeitar
          </button>
          <button
            onClick={onAccept}
            className="rounded-md bg-delvis-ink px-4 py-2 text-xs font-semibold text-white hover:bg-delvis-teal"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  )
}

export function PublicFooter() {
  const consent = useConsent()
  return (
    <footer className="border-t border-delvis-line bg-delvis-surface py-6 font-body">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 text-xs text-delvis-mute sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-bold text-delvis-ink">footballtrend</span> — cada notícia é gerada a partir de
          factos verificados e revista por um editor humano antes de publicar. © {new Date().getFullYear()}
        </p>
        <div className="flex flex-wrap gap-4 font-semibold">
          <span>Sobre</span>
          <span>Contacto</span>
          <span>Política editorial</span>
          <Link to="/politica-de-privacidade" className="hover:text-delvis-teal hover:underline">
            Política de privacidade
          </Link>
          <button type="button" onClick={consent.reset} className="hover:text-delvis-teal hover:underline">
            Gerir cookies
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
        {category ?? 'Futebol'}
      </span>
    </div>
  )
}
