import { queryOptions } from '@tanstack/react-query'
import type { PublishedArticle } from '@repo/shared'
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

async function fetchArticles(category: string | null, search: string | null): Promise<PublishedArticle[]> {
  let query = supabase.from('published_articles').select('*').order('published_at', { ascending: false }).limit(30)
  if (category) query = query.eq('category', category)
  const term = search ? sanitizeSearchTerm(search) : ''
  if (term) query = query.or(`title.ilike.%${term}%,seo_description.ilike.%${term}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

async function fetchArticle(slug: string): Promise<PublishedArticle | null> {
  const { data, error } = await supabase.from('published_articles').select('*').eq('slug', slug).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

async function fetchCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('published_articles')
    .select('category')
    .not('category', 'is', null)
  if (error) throw new Error(error.message)
  const unique = new Set((data ?? []).map((row) => row.category).filter((c): c is string => !!c))
  return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt'))
}

export const articlesQuery = (category: string | null, search: string | null) =>
  queryOptions({
    queryKey: ['published_articles', { category, search }],
    queryFn: () => fetchArticles(category, search),
  })

export const articleQuery = (slug: string) =>
  queryOptions({
    queryKey: ['published_article', slug],
    queryFn: () => fetchArticle(slug),
  })

export const categoriesQuery = () =>
  queryOptions({
    queryKey: ['published_articles', 'categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  })

/**
 * Todos os artigos publicados, para o sitemap. O PostgREST do Supabase corta
 * cada resposta a 1000 linhas por omissão — por isso pagina até esgotar.
 */
export async function fetchSitemapEntries(): Promise<{ slug: string; published_at: string | null }[]> {
  const pageSize = 1000
  const entries: { slug: string; published_at: string | null }[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('published_articles')
      .select('slug, published_at')
      .order('published_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    entries.push(...data)
    if (data.length < pageSize) return entries
  }
}
