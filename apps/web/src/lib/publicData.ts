import { queryOptions } from '@tanstack/react-query'
import type { PublishedArticle } from '@repo/shared'
import type { Lang } from './i18n'
import { supabase } from './supabase'

/**
 * Leituras do site público (view `published_articles`, chave anon). Partilhadas
 * entre as páginas e o `entry-server.tsx`: o SSR pré-carrega exatamente as
 * mesmas query keys que as páginas usam, para o cliente hidratar sem voltar a
 * pedir nem mostrar "A carregar…" por cima do HTML do servidor.
 */

/** Só caracteres que têm significado sintático no `.or()` do PostgREST. */
export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[%,()]/g, ' ').trim()
}

async function fetchArticles(lang: Lang, category: string | null, search: string | null): Promise<PublishedArticle[]> {
  let query = supabase
    .from('published_articles')
    .select('*')
    .eq('lang', lang)
    .order('published_at', { ascending: false })
    .limit(30)
  if (category) query = query.eq('category', category)
  const term = search ? sanitizeSearchTerm(search) : ''
  if (term) query = query.or(`title.ilike.%${term}%,seo_description.ilike.%${term}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

async function fetchArticle(lang: Lang, slug: string): Promise<PublishedArticle | null> {
  const { data, error } = await supabase
    .from('published_articles')
    .select('*')
    .eq('lang', lang)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/**
 * Um slug que não existe nesta língua, mas existe noutra — ex.: um link antigo
 * em português aberto com /en/ à frente (a deteção de língua do servidor faz
 * isto), ou um slug traduzido partilhado com o prefixo errado. Devolve a
 * versão na língua pedida, se houver, ou a original (pt), para o servidor
 * redirecionar em vez de responder 404.
 */
export async function findArticleInAnyLang(slug: string): Promise<PublishedArticle | null> {
  const { data, error } = await supabase.from('published_articles').select('*').eq('slug', slug).limit(1)
  if (error) throw new Error(error.message)
  return data[0] ?? null
}

async function fetchCategories(lang: Lang): Promise<string[]> {
  const { data, error } = await supabase
    .from('published_articles')
    .select('category')
    .eq('lang', lang)
    .not('category', 'is', null)
  if (error) throw new Error(error.message)
  const unique = new Set((data ?? []).map((row) => row.category).filter((c): c is string => !!c))
  return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt'))
}

export const articlesQuery = (lang: Lang, category: string | null, search: string | null) =>
  queryOptions({
    queryKey: ['published_articles', lang, { category, search }],
    queryFn: () => fetchArticles(lang, category, search),
  })

export const articleQuery = (lang: Lang, slug: string) =>
  queryOptions({
    queryKey: ['published_article', lang, slug],
    queryFn: () => fetchArticle(lang, slug),
  })

export const categoriesQuery = (lang: Lang) =>
  queryOptions({
    queryKey: ['published_articles', lang, 'categories'],
    queryFn: () => fetchCategories(lang),
    staleTime: 5 * 60 * 1000,
  })

/** Editor responsável (settings.authors.editor), tal como aparece nos artigos
 * publicados — as páginas institucionais mostram-no sem precisar de sessão. */
async function fetchEditor(): Promise<string | null> {
  const { data, error } = await supabase
    .from('published_articles')
    .select('editor')
    .not('editor', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  return data[0]?.editor ?? null
}

export const editorQuery = () =>
  queryOptions({
    queryKey: ['published_articles', 'editor'],
    queryFn: fetchEditor,
    staleTime: 60 * 60 * 1000,
  })

/**
 * Todos os artigos publicados, para o sitemap. O PostgREST do Supabase corta
 * cada resposta a 1000 linhas por omissão — por isso pagina até esgotar.
 */
export interface SitemapEntry {
  slug: string
  lang: string
  published_at: string | null
  alternates: PublishedArticle['alternates']
}

export async function fetchSitemapEntries(): Promise<SitemapEntry[]> {
  const pageSize = 1000
  const entries: SitemapEntry[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('published_articles')
      .select('slug, lang, published_at, alternates')
      .order('published_at', { ascending: false })
      .order('id')
      .order('lang')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    entries.push(...data)
    if (data.length < pageSize) return entries
  }
}
