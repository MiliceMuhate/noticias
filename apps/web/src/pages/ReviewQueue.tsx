import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ContentItem, SportFact } from '@repo/shared'
import { supabase } from '../lib/supabase'

/**
 * Fila de revisão — o portão de aprovação humana (guardrail #1).
 * Cada ação (aprovar/rejeitar/editar) escreve em audit_log. Aprovar É publicar:
 * a transição para 'published' dispara o trigger na BD que calcula o slug/URL
 * do site (não há canal externo nem passo de publicação separado).
 *
 * Motor editorial de 6 passos (docs/publicador): cada peça já vem com o
 * relatório do portão de originalidade, o trace factos↔parágrafo, e alternativas
 * de título — ver docs/publicador/EDITORIAL.md §8 (checklist de revisão).
 */

interface OriginalityMetadata {
  verdict: 'pass' | 'review' | 'block'
  flagged_spans: string[]
  reasons: string[]
  containment_5: number
  longest_common_run: number
}

interface ContentMeta {
  variation?: string
  desk?: string
  dek?: string
  source_name?: string
  source_url?: string
  originality?: OriginalityMetadata
  afirmacoes_de_contexto?: string[]
  alternativas?: string[]
}

interface PublishingLimits {
  max_published_per_day?: number
  min_minutes_between_publications?: number
}

type ItemWithFacts = ContentItem & { topics: { term: string; sport_facts: SportFact[] } | null }

async function fetchQueue(): Promise<ItemWithFacts[]> {
  const { data, error } = await supabase
    .from('content_items')
    .select('*, topics(term, sport_facts(*))')
    .in('status', ['pending_review', 'published', 'rejected'])
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return data as unknown as ItemWithFacts[]
}

async function fetchPublishingLimits(): Promise<PublishingLimits | null> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'publishing_limits').maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.value as PublishingLimits | undefined) ?? null
}

async function audit(action: string, entityId: string, detail: Record<string, unknown> = {}) {
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase.from('audit_log').insert({
    actor: userData.user?.id ?? null,
    action,
    entity: 'content_item',
    entity_id: entityId,
    detail: detail as never,
  })
  if (error) throw new Error(`audit_log: ${error.message}`)
}

/** limite de ritmo (docs/publicador/EDITORIAL.md §9) — só os dois calculáveis a
 * partir do que já temos em mão; max_per_source_per_day e
 * require_manual_edit_every_n ficam para depois (ver plano). */
function limitBlockReason(items: ItemWithFacts[], limits: PublishingLimits | null): string | null {
  if (!limits) return null
  const published = items.filter((i) => i.status === 'published' && i.published_at)

  const last24h = published.filter(
    (i) => Date.now() - new Date(i.published_at!).getTime() < 24 * 3600 * 1000,
  )
  if (limits.max_published_per_day != null && last24h.length >= limits.max_published_per_day) {
    return `limite diário de publicações atingido (${last24h.length}/${limits.max_published_per_day})`
  }

  if (limits.min_minutes_between_publications && published.length > 0) {
    const lastPublishedAt = published.reduce((latest, i) => (i.published_at! > latest ? i.published_at! : latest), published[0]!.published_at!)
    const minutesSince = (Date.now() - new Date(lastPublishedAt).getTime()) / 60000
    if (minutesSince < limits.min_minutes_between_publications) {
      const remaining = Math.ceil(limits.min_minutes_between_publications - minutesSince)
      return `intervalo mínimo entre publicações ainda não passou (faltam ${remaining} min)`
    }
  }

  return null
}

export default function ReviewQueue() {
  const queryClient = useQueryClient()
  const { data: items, isLoading, error } = useQuery({ queryKey: ['content_items'], queryFn: fetchQueue })
  const { data: limits } = useQuery({ queryKey: ['settings', 'publishing_limits'], queryFn: fetchPublishingLimits })
  const [editing, setEditing] = useState<ItemWithFacts | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['content_items'] })

  const approve = useMutation({
    mutationFn: async (item: ItemWithFacts) => {
      const { error: e } = await supabase.from('content_items').update({ status: 'published' }).eq('id', item.id)
      if (e) throw new Error(e.message)
    },
    onSettled: invalidate,
  })

  const reject = useMutation({
    mutationFn: async ({ item, note }: { item: ItemWithFacts; note: string }) => {
      const { error: e } = await supabase
        .from('content_items')
        .update({ status: 'rejected', review_note: note })
        .eq('id', item.id)
      if (e) throw new Error(e.message)
      await audit('reject', item.id, { note })
    },
    onSettled: invalidate,
  })

  const saveEdit = useMutation({
    mutationFn: async ({ id, title, body }: { id: string; title: string; body: string }) => {
      const { error: e } = await supabase.from('content_items').update({ title, body }).eq('id', id)
      if (e) throw new Error(e.message)
      await audit('edit', id, { title })
    },
    onSuccess: () => setEditing(null),
    onSettled: invalidate,
  })

  const swapTitle = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error: e } = await supabase.from('content_items').update({ title }).eq('id', id)
      if (e) throw new Error(e.message)
    },
    onSettled: invalidate,
  })

  const unpublish = useMutation({
    mutationFn: async (item: ItemWithFacts) => {
      const { error: e } = await supabase
        .from('content_items')
        .update({ status: 'pending_review', published_at: null, published_url: null, published_via: null })
        .eq('id', item.id)
      if (e) throw new Error(e.message)
      await audit('unpublish', item.id, { was_published_via: item.published_via })
    },
    onSettled: invalidate,
  })

  if (isLoading) return <p className="text-slate-500">A carregar fila…</p>
  if (error) return <p className="text-red-600">Erro: {(error as Error).message}</p>

  const pending = (items ?? []).filter((i) => i.status === 'pending_review')
  const rest = (items ?? []).filter((i) => i.status !== 'pending_review')
  const limitReason = limitBlockReason(items ?? [], limits ?? null)

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Por rever <span className="text-slate-400">({pending.length})</span>
        </h2>
        {limitReason && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⏸️ Aprovar está temporariamente bloqueado: {limitReason} (
            <code>settings.publishing_limits</code>).
          </p>
        )}
        {pending.length === 0 && <p className="text-sm text-slate-500">Nada por rever. 🎉</p>}
        <div className="space-y-4">
          {pending.map((item) => {
            const isThisItem = (v: { id: string } | undefined) => v?.id === item.id
            const approving = approve.isPending && isThisItem(approve.variables)
            const rejecting = reject.isPending && isThisItem(reject.variables?.item)
            const cardError =
              (approve.isError && isThisItem(approve.variables) && approve.error.message) ||
              (reject.isError && isThisItem(reject.variables?.item) && reject.error.message) ||
              null

            return (
              <ReviewCard
                key={item.id}
                item={item}
                onApprove={() => approve.mutate(item)}
                onReject={(note) => reject.mutate({ item, note })}
                onEdit={() => setEditing(item)}
                onSwapTitle={(title) => swapTitle.mutate({ id: item.id, title })}
                approving={approving}
                rejecting={rejecting}
                busy={approve.isPending || reject.isPending}
                approveDisabledReason={limitReason}
                error={cardError}
              />
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Histórico recente</h2>
        <div className="space-y-2">
          {rest.map((item) => {
            const unpublishing = unpublish.isPending && unpublish.variables?.id === item.id
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="truncate font-medium text-slate-700">{item.title ?? '(sem título)'}</span>
                  {item.status === 'published' && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <PublishMethodBadge via={item.published_via} />
                      {item.published_at && <span>· {new Date(item.published_at).toLocaleString('pt')}</span>}
                    </div>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-3">
                  {item.published_url && (
                    <a
                      href={item.published_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      ver publicado
                    </a>
                  )}
                  {item.status === 'published' && (
                    <button
                      onClick={() => {
                        if (window.confirm('Retirar este artigo do site? Volta para "Por rever".')) unpublish.mutate(item)
                      }}
                      disabled={unpublishing}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {unpublishing ? 'A retirar…' : 'Retirar publicação'}
                    </button>
                  )}
                  <StatusBadge status={item.status} />
                </span>
                {unpublish.isError && unpublish.variables?.id === item.id && (
                  <p className="w-full text-xs text-red-600">Falhou: {unpublish.error.message}</p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {editing && (
        <EditModal
          item={editing}
          onCancel={() => setEditing(null)}
          onSave={(title, body) => saveEdit.mutate({ id: editing.id, title, body })}
          busy={saveEdit.isPending}
          error={saveEdit.isError ? saveEdit.error.message : null}
        />
      )}
    </div>
  )
}

function OriginalityBadge({ originality }: { originality?: OriginalityMetadata }) {
  if (!originality) return null
  if (originality.verdict === 'pass') {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        🟢 Original · LCR {originality.longest_common_run} · {(originality.containment_5 * 100).toFixed(1)}%
      </span>
    )
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      🟡 Verificar ({originality.reasons.join(', ')})
    </span>
  )
}

const EDITORIAL_CHECKLIST = [
  'O título promete o que o corpo entrega?',
  'O lead é diferente do lead da fonte (abrir o link e comparar)?',
  'Existe alguma frase de 8+ palavras igual ao original? (o distintivo de originalidade já responde)',
  'Os três blocos obrigatórios estão lá e o "Porque importa" diz mesmo alguma coisa?',
  'Há algum número, nome ou data que não esteja no texto extraído da fonte?',
  'As citações estão atribuídas e são curtas?',
  'O artigo lê-se de forma autónoma, sem clicar no original?',
  'A variação é diferente da dos artigos anteriores de hoje?',
  'A atribuição (fonte + link) está presente?',
  'Publicaria isto com o seu nome em cima?',
]

function ReviewCard({
  item,
  onApprove,
  onReject,
  onEdit,
  onSwapTitle,
  busy,
  approving,
  rejecting,
  approveDisabledReason,
  error,
}: {
  item: ItemWithFacts
  onApprove: () => void
  onReject: (note: string) => void
  onEdit: () => void
  onSwapTitle: (title: string) => void
  busy: boolean
  approving: boolean
  rejecting: boolean
  approveDisabledReason: string | null
  error: string | null
}) {
  const [showSource, setShowSource] = useState(false)
  const facts = item.topics?.sport_facts ?? []
  const sourceText = (facts[0]?.data as { text?: string } | undefined)?.text ?? null
  const meta = item.metadata as ContentMeta | null
  const originality = meta?.originality
  const needsReview = originality?.verdict === 'review'

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>artigo detetado: {item.topics?.term ?? '?'}</span>
        <span>·</span>
        <span>
          autor: {item.author?.byline ?? '—'}
          {meta?.desk ? ` · ${meta.desk}` : ''}
        </span>
        {meta?.variation && (
          <>
            <span>·</span>
            <span>variação: {meta.variation}</span>
          </>
        )}
        {originality && (
          <>
            <span>·</span>
            <OriginalityBadge originality={originality} />
          </>
        )}
      </div>
      {meta?.source_url && (
        <a
          href={meta.source_url}
          target="_blank"
          rel="noreferrer"
          className="mb-1 inline-block text-xs font-medium text-blue-600 hover:underline"
        >
          ↗ ver artigo original {meta.source_name ? `(${meta.source_name})` : ''} — confirma a fidelidade antes de aprovar
        </a>
      )}
      {item.media_url && (
        <img
          src={item.media_url}
          alt=""
          className="mt-2 max-h-48 w-full rounded-md object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      )}
      <h3 className="mt-2 text-lg font-semibold text-slate-900">{item.title ?? '(sem título)'}</h3>
      {meta?.dek && <p className="text-sm italic text-slate-500">{meta.dek}</p>}

      {meta?.alternativas && meta.alternativas.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          <span>títulos alternativos:</span>
          {meta.alternativas.map((alt) => (
            <button
              key={alt}
              onClick={() => onSwapTitle(alt)}
              className="rounded-full border border-slate-200 px-2 py-0.5 hover:border-blue-400 hover:text-blue-600"
            >
              {alt}
            </button>
          ))}
        </div>
      )}

      <div className="prose prose-sm prose-slate mt-2 max-h-64 max-w-none overflow-y-auto rounded-md bg-slate-50 p-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.body}</ReactMarkdown>
      </div>

      {needsReview && originality && originality.flagged_spans.length > 0 && sourceText && (
        <div className="mt-3 grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
              Frases a verificar (nosso texto)
            </p>
            <ul className="space-y-1 text-xs text-amber-900">
              {originality.flagged_spans.map((span, i) => (
                <li key={i} className="rounded bg-white/60 p-1.5">
                  {span}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
              Texto da fonte (compara ao lado)
            </p>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-white/60 p-1.5 text-xs text-amber-900">
              {sourceText}
            </div>
          </div>
        </div>
      )}

      {meta?.afirmacoes_de_contexto && meta.afirmacoes_de_contexto.length > 0 && (
        <details className="mt-3 rounded-md border border-slate-200 p-2 text-xs">
          <summary className="cursor-pointer font-medium text-slate-600">
            Afirmações de contexto (não vêm da ficha de factos — {meta.afirmacoes_de_contexto.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-600">
            {meta.afirmacoes_de_contexto.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>
      )}

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium text-slate-500">Checklist de revisão</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-slate-600">
          {EDITORIAL_CHECKLIST.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </details>

      <button
        onClick={() => setShowSource((v) => !v)}
        className="mt-2 text-xs font-medium text-blue-600 hover:underline"
      >
        {showSource ? 'Esconder' : 'Ver'} texto extraído da fonte ({facts.length})
      </button>
      {showSource && (
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
          {facts.map((f) => `[${f.provider}] ${f.source_url ?? ''}\n${JSON.stringify(f.data, null, 2)}`).join('\n\n')}
        </pre>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Falhou: {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={onApprove}
          disabled={busy || !!approveDisabledReason}
          title={approveDisabledReason ?? undefined}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {approving ? 'A publicar…' : 'Aprovar e publicar'}
        </button>
        <button
          onClick={() => {
            const note = window.prompt('Motivo da rejeição (fica registado):')
            if (note !== null) onReject(note)
          }}
          disabled={busy}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {rejecting ? 'A rejeitar…' : 'Rejeitar'}
        </button>
        <button
          onClick={onEdit}
          disabled={busy}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Editar
        </button>
      </div>
    </article>
  )
}

function EditModal({
  item,
  onCancel,
  onSave,
  busy,
  error,
}: {
  item: ItemWithFacts
  onCancel: () => void
  onSave: (title: string, body: string) => void
  busy: boolean
  error: string | null
}) {
  const [title, setTitle] = useState(item.title ?? '')
  const [body, setBody] = useState(item.body ?? '')

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl space-y-3 rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold">Editar peça</h3>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
        />
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Falhou: {error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => onSave(title, body)}
            disabled={busy}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending_review: 'bg-amber-100 text-amber-800',
    published: 'bg-green-100 text-green-800',
    rejected: 'bg-slate-200 text-slate-600',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-slate-100'}`}>
      {status}
    </span>
  )
}

function PublishMethodBadge({ via }: { via: 'manual' | 'auto' | null }) {
  if (via === 'auto') return <span title="Publicado pelo piloto automático, sem clique humano">🤖 automática</span>
  if (via === 'manual') return <span title="Aprovado manualmente no dashboard">🧑 manual</span>
  return null
}
