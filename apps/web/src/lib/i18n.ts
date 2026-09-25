import { useLocation } from 'react-router-dom'

/**
 * Línguas do site público. O português vive na raiz (`/`, `/artigo/x`) — os
 * URLs que o Google já indexou não mudam; as outras línguas têm prefixo
 * (`/en/`, `/en/artigo/y`). O painel /admin fica só em português.
 *
 * A escolha automática da língua (país do visitante, depois Accept-Language)
 * acontece no servidor (server.js → detectLang); a escolha manual no seletor
 * grava o cookie `lang`, que passa à frente da deteção.
 */

export const LANGS = ['pt', 'en', 'es', 'fr'] as const
export type Lang = (typeof LANGS)[number]
export const DEFAULT_LANG: Lang = 'pt'
export const PREFIXED_LANGS = LANGS.filter((l) => l !== DEFAULT_LANG)

export const LANG_COOKIE = 'lang'

export function isLang(value: string | null | undefined): value is Lang {
  return !!value && (LANGS as readonly string[]).includes(value)
}

/** Língua de um caminho: `/en/artigo/x` → 'en'; `/artigo/x` → 'pt'. */
export function langFromPath(pathname: string): Lang {
  const first = pathname.split('/')[1] ?? ''
  return isLang(first) && first !== DEFAULT_LANG ? first : DEFAULT_LANG
}

/** Caminho sem o prefixo de língua: `/en/artigo/x` → `/artigo/x`; `/en` → `/`. */
export function stripLang(pathname: string): string {
  const lang = langFromPath(pathname)
  if (lang === DEFAULT_LANG) return pathname || '/'
  const rest = pathname.slice(lang.length + 1)
  return rest.startsWith('/') ? rest : `/${rest}`
}

/** `localizedPath('en', '/artigo/x')` → `/en/artigo/x`; `('pt', '/')` → `/`. */
export function localizedPath(lang: Lang, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  if (lang === DEFAULT_LANG) return clean
  return clean === '/' ? `/${lang}/` : `/${lang}${clean}`
}

export const HTML_LANG: Record<Lang, string> = { pt: 'pt-PT', en: 'en', es: 'es', fr: 'fr' }
export const OG_LOCALE: Record<Lang, string> = { pt: 'pt_PT', en: 'en_GB', es: 'es_ES', fr: 'fr_FR' }
export const LANG_LABEL: Record<Lang, string> = { pt: 'Português', en: 'English', es: 'Español', fr: 'Français' }

const pt = {
  tagline: 'Notícias de futebol',
  searchPlaceholder: 'Pesquisar notícias',
  closeSearch: 'Fechar pesquisa',
  home: 'Início',
  live: 'Ao minuto',
  language: 'Língua',
  cookieAria: 'Preferências de cookies',
  cookieText:
    'Usamos cookies para estatísticas de visitas (Google Analytics) e para anúncios (Google AdSense). Só carregam depois de aceitares.',
  learnMore: 'Saber mais',
  reject: 'Rejeitar',
  accept: 'Aceitar',
  footerText:
    'cada notícia é gerada a partir de factos verificados e revista por um editor humano antes de publicar.',
  about: 'Sobre',
  contact: 'Contacto',
  editorialPolicy: 'Política editorial',
  privacyPolicy: 'Política de privacidade',
  manageCookies: 'Gerir cookies',
  football: 'Futebol',
  category: 'Categoria:',
  resultsFor: 'Resultados para',
  loading: 'A carregar…',
  error: 'Erro:',
  emptyTitle: 'Ainda sem notícias por aqui',
  emptyText: 'Volta em breve — é só esperar pelo apito inicial.',
  translationsPending: 'As traduções desta língua estão a ser preparadas.',
  latest: 'Últimas',
  moreNews: 'Mais notícias',
  untitled: '(sem título)',
  newsroom: 'Redação',
  backToNews: '← Notícias de futebol',
  articleNotFound: 'Artigo não encontrado.',
  photo: 'Foto:',
  rewrittenFrom: 'Reformulado a partir de notícia publicada por',
  externalSource: 'fonte externa',
  viewOriginal: 'Ver artigo original ↗',
  translatedFrom: 'Tradução do artigo original em português.',
  readInPortuguese: 'Ler em português',
  pageNotFound: 'Página não encontrada',
  pageNotFoundText: 'Este endereço não existe ou a notícia foi retirada.',
  yourChoice: 'A tua escolha atual:',
  youAccepted: 'aceitaste',
  youRejected: 'rejeitaste',
  nonEssentialCookies: 'cookies não essenciais.',
  change: 'Mudar',
  justNow: 'agora mesmo',
  defaultTitle: 'footballtrend — Notícias de Futebol',
  defaultDescription:
    'Notícias de futebol ao minuto: transferências, resultados e análise, sempre com a fonte original indicada.',
  categoryDescription: 'Últimas notícias de futebol sobre {category}.',
  privacyDescription: 'Como o footballtrend usa cookies, Google Analytics e Google AdSense.',
}

export type MessageKey = keyof typeof pt

const MESSAGES: Record<Lang, Record<MessageKey, string>> = {
  pt,
  en: {
    tagline: 'Football news',
    searchPlaceholder: 'Search news',
    closeSearch: 'Close search',
    home: 'Home',
    live: 'Live',
    language: 'Language',
    cookieAria: 'Cookie preferences',
    cookieText:
      'We use cookies for visit statistics (Google Analytics) and for ads (Google AdSense). They only load after you accept.',
    learnMore: 'Learn more',
    reject: 'Reject',
    accept: 'Accept',
    footerText: 'every story is built from verified facts and reviewed by a human editor before publishing.',
    about: 'About',
    contact: 'Contact',
    editorialPolicy: 'Editorial policy',
    privacyPolicy: 'Privacy policy',
    manageCookies: 'Manage cookies',
    football: 'Football',
    category: 'Category:',
    resultsFor: 'Results for',
    loading: 'Loading…',
    error: 'Error:',
    emptyTitle: 'No news here yet',
    emptyText: 'Check back soon — kick-off is just around the corner.',
    translationsPending: 'Stories in English are on their way.',
    latest: 'Latest',
    moreNews: 'More news',
    untitled: '(untitled)',
    newsroom: 'Newsroom',
    backToNews: '← Football news',
    articleNotFound: 'Article not found.',
    photo: 'Photo:',
    rewrittenFrom: 'Rewritten from a story published by',
    externalSource: 'an external source',
    viewOriginal: 'View original article ↗',
    translatedFrom: 'Translated from the original article in Portuguese.',
    readInPortuguese: 'Read in Portuguese',
    pageNotFound: 'Page not found',
    pageNotFoundText: 'This address does not exist or the story has been removed.',
    yourChoice: 'Your current choice:',
    youAccepted: 'you accepted',
    youRejected: 'you rejected',
    nonEssentialCookies: 'non-essential cookies.',
    change: 'Change',
    justNow: 'just now',
    defaultTitle: 'footballtrend — Football News',
    defaultDescription:
      'Football news as it happens: transfers, results and analysis, always with the original source credited.',
    categoryDescription: 'Latest football news about {category}.',
    privacyDescription: 'How footballtrend uses cookies, Google Analytics and Google AdSense.',
  },
  es: {
    tagline: 'Noticias de fútbol',
    searchPlaceholder: 'Buscar noticias',
    closeSearch: 'Cerrar búsqueda',
    home: 'Inicio',
    live: 'Al minuto',
    language: 'Idioma',
    cookieAria: 'Preferencias de cookies',
    cookieText:
      'Usamos cookies para estadísticas de visitas (Google Analytics) y para anuncios (Google AdSense). Solo se cargan después de que aceptes.',
    learnMore: 'Más información',
    reject: 'Rechazar',
    accept: 'Aceptar',
    footerText: 'cada noticia se elabora a partir de hechos verificados y la revisa un editor humano antes de publicarse.',
    about: 'Acerca de',
    contact: 'Contacto',
    editorialPolicy: 'Política editorial',
    privacyPolicy: 'Política de privacidad',
    manageCookies: 'Gestionar cookies',
    football: 'Fútbol',
    category: 'Categoría:',
    resultsFor: 'Resultados para',
    loading: 'Cargando…',
    error: 'Error:',
    emptyTitle: 'Todavía no hay noticias aquí',
    emptyText: 'Vuelve pronto — el pitido inicial está al caer.',
    translationsPending: 'Las noticias en español están en camino.',
    latest: 'Últimas',
    moreNews: 'Más noticias',
    untitled: '(sin título)',
    newsroom: 'Redacción',
    backToNews: '← Noticias de fútbol',
    articleNotFound: 'Artículo no encontrado.',
    photo: 'Foto:',
    rewrittenFrom: 'Reescrito a partir de una noticia publicada por',
    externalSource: 'una fuente externa',
    viewOriginal: 'Ver artículo original ↗',
    translatedFrom: 'Traducción del artículo original en portugués.',
    readInPortuguese: 'Leer en portugués',
    pageNotFound: 'Página no encontrada',
    pageNotFoundText: 'Esta dirección no existe o la noticia se ha retirado.',
    yourChoice: 'Tu elección actual:',
    youAccepted: 'aceptaste',
    youRejected: 'rechazaste',
    nonEssentialCookies: 'las cookies no esenciales.',
    change: 'Cambiar',
    justNow: 'ahora mismo',
    defaultTitle: 'footballtrend — Noticias de Fútbol',
    defaultDescription:
      'Noticias de fútbol al minuto: fichajes, resultados y análisis, siempre con la fuente original indicada.',
    categoryDescription: 'Últimas noticias de fútbol sobre {category}.',
    privacyDescription: 'Cómo footballtrend usa cookies, Google Analytics y Google AdSense.',
  },
  fr: {
    tagline: 'Actualité du football',
    searchPlaceholder: 'Rechercher des articles',
    closeSearch: 'Fermer la recherche',
    home: 'Accueil',
    live: 'En direct',
    language: 'Langue',
    cookieAria: 'Préférences en matière de cookies',
    cookieText:
      'Nous utilisons des cookies pour les statistiques de visites (Google Analytics) et pour la publicité (Google AdSense). Ils ne se chargent qu’après votre accord.',
    learnMore: 'En savoir plus',
    reject: 'Refuser',
    accept: 'Accepter',
    footerText: 'chaque article est rédigé à partir de faits vérifiés et relu par un éditeur humain avant publication.',
    about: 'À propos',
    contact: 'Contact',
    editorialPolicy: 'Charte éditoriale',
    privacyPolicy: 'Politique de confidentialité',
    manageCookies: 'Gérer les cookies',
    football: 'Football',
    category: 'Catégorie :',
    resultsFor: 'Résultats pour',
    loading: 'Chargement…',
    error: 'Erreur :',
    emptyTitle: 'Pas encore d’articles ici',
    emptyText: 'Revenez bientôt — le coup d’envoi approche.',
    translationsPending: 'Les articles en français arrivent bientôt.',
    latest: 'À la une',
    moreNews: 'Plus d’articles',
    untitled: '(sans titre)',
    newsroom: 'Rédaction',
    backToNews: '← Actualité du football',
    articleNotFound: 'Article introuvable.',
    photo: 'Photo :',
    rewrittenFrom: 'Réécrit à partir d’un article publié par',
    externalSource: 'une source externe',
    viewOriginal: 'Voir l’article original ↗',
    translatedFrom: 'Traduction de l’article original en portugais.',
    readInPortuguese: 'Lire en portugais',
    pageNotFound: 'Page introuvable',
    pageNotFoundText: 'Cette adresse n’existe pas ou l’article a été retiré.',
    yourChoice: 'Votre choix actuel :',
    youAccepted: 'vous avez accepté',
    youRejected: 'vous avez refusé',
    nonEssentialCookies: 'les cookies non essentiels.',
    change: 'Modifier',
    justNow: 'à l’instant',
    defaultTitle: 'footballtrend — Actualité du Football',
    defaultDescription:
      'L’actualité du football en continu : transferts, résultats et analyses, toujours avec la source originale citée.',
    categoryDescription: 'Dernières actualités du football : {category}.',
    privacyDescription: 'Comment footballtrend utilise les cookies, Google Analytics et Google AdSense.',
  },
}

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string>): string {
  let text = MESSAGES[lang][key] ?? MESSAGES.pt[key]
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v)
  return text
}

/** Língua da página atual, a partir do URL (funciona igual no SSR e no browser). */
export function useLang(): Lang {
  return langFromPath(useLocation().pathname)
}

export function useT(): (key: MessageKey, vars?: Record<string, string>) => string {
  const lang = useLang()
  return (key, vars) => translate(lang, key, vars)
}

/** Grava a escolha manual — o servidor deixa de detetar a língua a partir daí. */
export function rememberLang(lang: Lang): void {
  try {
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  } catch {
    // cookies bloqueados — a escolha vale só para esta navegação
  }
}

export interface Alternate {
  lang: Lang
  slug: string
}

/** `alternates` da view published_articles (jsonb) → lista tipada. */
export function parseAlternates(value: unknown): Alternate[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (a): a is Alternate => !!a && typeof a === 'object' && isLang((a as Alternate).lang) && typeof (a as Alternate).slug === 'string',
  )
}
