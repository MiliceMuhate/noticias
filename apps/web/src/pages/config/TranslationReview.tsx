import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ContentTranslation } from '@repo/shared'
import { supabase } from '../../lib/supabase'
import { Section } from './fields'

/**
 * Revisão humana por amostragem das traduções publicadas (política editorial,
 * §4). As traduções entram no site sem aprovação individual; aqui um operador
 * confirma uma amostra ou retira uma do site. As que a auditoria de fidelidade
 * marcou "rever" aparecem primeiro. Escrita só pela RPC review_translation.
 */

interface AuditJson {
  veredicto?: 'aprovado' | 'rever' | 'bloquear'
  resumo?: string
  problemas?: { trecho: string; tipo: string; explicacao: string }[]
}

type Row = Pick<ContentTranslation, 'id' | 'lang' | 'status' | 'title' | 'body' | 'slug' | 'audit' | 'reviewed_at'> & {
  content_items: { title: string | null; body: string | null } | null
}

const LANG_LABEL: Record<string, string> = { en: 'Inglês', es: 'Espanhol', fr: 'Francês' }

async function fetchRows(): Promise<Row[]> {
  const { data, error } = await supabase
    .from('content_translations')
    .select('id, lang, status, title, body, slug, audit, reviewed_at, content_items(title, body)')
    .in('status', ['ready', 'withdrawn'])
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return data as unknown as Row[]
}

export default function TranslationReview() {
  const queryClient = useQueryClient()
  const { data: rows, isLoading } = useQuery({ queryKey: ['content_translations', 'review'], queryFn: fetchRows })
  const [open, setOpen] = useState<string | null>(null)

  const review = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'ok' | 'withdraw' | 'restore' }) => {
      const { error } = await supabase.rpc('review_translation', { p_id: id, p_action: action })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      setOpen(null)
      void queryClient.invalidateQueries({ queryKey: ['content_translations'] })
    },
  })

  if (isLoading) return <p className="text-sm text-slate-500">A carregar traduções…</p>

  const all = rows ?? []
  const pending = all
    .filter((r) => r.status === 'ready' && !r.reviewed_at)
    .sort((a, b) => Number((b.audit as AuditJson | null)?.veredicto === 'rever') - Number((a.audit as AuditJson | null)?.veredicto === 'rever'))
  const withdrawn = all.filter((r) => r.status === 'withdrawn')
  const reviewedCount = all.filter((r) => r.status === 'ready' && r.reviewed_at).length

  return (
    <Section
      title="Revisão por amostragem"
      description={
        <>
          As traduções entram no site sem aprovação individual. Rever algumas regularmente — sobretudo as marcadas 🟡 —
          é o que a política editorial promete aos leitores. {reviewedCount} revistas · {pending.length} por rever.
        </>
      }
    >
      {pending.length === 0 && <p className="text-sm text-slate-500">Nada por rever.</p>}
      <div className="space-y-2">
        {pending.slice(0, 15).map((r) => {
          const audit = r.audit as AuditJson | null
          const isOpen = open === r.id
          return (
            <div key={r.id} className="rounded-md border border-slate-200">
              <button
                onClick={() => setOpen(isOpen ? null : r.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
              >
                <span className="min-w-0">
                  <span className="mr-2 text-xs font-semibold uppercase text-slate-500">{r.lang}</span>
                  {audit?.veredicto === 'rever' && <span className="mr-1">🟡</span>}
                  <span className="text-slate-800">{r.title}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{isOpen ? 'fechar' : 'comparar'}</span>
              </button>
              {isOpen && (
                <div className="border-t border-slate-100 p-3">
                  {audit?.resumo && (
                    <p className="mb-2 text-xs text-slate-600">
                      <strong>Auditoria:</strong> {audit.resumo}
                    </p>
                  )}
                  {audit?.problemas && audit.problemas.length > 0 && (
                    <ul className="mb-3 list-disc space-y-1 pl-4 text-xs text-amber-800">
                      {audit.problemas.map((p, i) => (
                        <li key={i}>
                          <em>{p.tipo}</em>: “{p.trecho}” — {p.explicacao}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Original (pt)</p>
                      <p className="mb-1 text-sm font-semibold">{r.content_items?.title}</p>
                      <div className="prose prose-sm max-h-80 max-w-none overflow-y-auto rounded bg-slate-50 p-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.content_items?.body ?? ''}</ReactMarkdown>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{LANG_LABEL[r.lang] ?? r.lang}</p>
                      <p className="mb-1 text-sm font-semibold">{r.title}</p>
                      <div className="prose prose-sm max-h-80 max-w-none overflow-y-auto rounded bg-slate-50 p-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.body ?? ''}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => review.mutate({ id: r.id, action: 'ok' })}
                      disabled={review.isPending}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      ✓ Está bem
                    </button>
                    <button
                      onClick={() =>
                        window.confirm('Retirar esta tradução do site? O artigo em português continua publicado.') &&
                        review.mutate({ id: r.id, action: 'withdraw' })
                      }
                      disabled={review.isPending}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Retirar do site
                    </button>
                    <a href={`/${r.lang}/artigo/${r.slug}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                      ver no site ↗
                    </a>
                    {review.isError && <span className="text-xs text-red-600">Falhou: {review.error.message}</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {withdrawn.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-slate-500">Retiradas ({withdrawn.length}) — não voltam a ser geradas enquanto o artigo pt não mudar</p>
          <div className="space-y-1">
            {withdrawn.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-3 py-1.5 text-xs">
                <span>
                  <span className="mr-2 font-semibold uppercase">{r.lang}</span>
                  {r.title}
                </span>
                <button
                  onClick={() => review.mutate({ id: r.id, action: 'restore' })}
                  disabled={review.isPending}
                  className="shrink-0 text-blue-600 hover:underline"
                >
                  Repor
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}
