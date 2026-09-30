import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { ContentItem, Topic } from '@repo/shared'
import { supabase } from '../lib/supabase'

/**
 * Piloto automático: um interruptor que deteta, gera e publica sozinho, sem
 * clique por artigo, enquanto estiver ligado (scheduler.autopilot_tick, a
 * cada poucos segundos). Ligar É a aprovação humana — passa a ser por lote,
 * não por artigo (ver a migração 20260922000001_autopilot.sql).
 *
 * Só publica sozinho o que o motor editorial (docs/publicador) validou sem
 * reservas (originalidade 'pass', auditoria 'aprovado'). Tudo o resto — falhas
 * de geração, peças que precisam de olhos humanos — fica isolado aqui, à
 * espera de ação; nunca é tocado pelo piloto.
 */

interface AutopilotSettings {
  enabled: boolean
  auto_published_streak?: number
  started_by?: string | null
  started_at?: string | null
  stopped_by?: string | null
  stopped_at?: string | null
  last_tick_at?: string | null
  last_error?: string | null
}

/** Acima disto, "última verificação" há X min é sinal de que o backend não está a correr
 * (autopilot_tick corre a cada ~20s enquanto o processo está vivo) — não um erro do piloto em si. */
const STALE_TICK_MINUTES = 2

interface PublishingLimits {
  require_manual_edit_every_n?: number
}

interface OriginalityMeta {
  verdict?: 'pass' | 'review' | 'block'
  reasons?: string[]
}

const DEFAULT_AUTOPILOT: AutopilotSettings = { enabled: false, auto_published_streak: 0 }

async function fetchAutomationSettings(): Promise<{ autopilot: AutopilotSettings; limits: PublishingLimits }> {
  const { data, error } = await supabase.from('settings').select('key, value').in('key', ['autopilot', 'publishing_limits'])
  if (error) throw new Error(error.message)
  const byKey = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
  return {
    autopilot: (byKey.autopilot as AutopilotSettings | undefined) ?? DEFAULT_AUTOPILOT,
    limits: (byKey.publishing_limits as PublishingLimits | undefined) ?? {},
  }
}

type TopicLite = Pick<Topic, 'id' | 'term' | 'status' | 'detected_at'>

async function fetchTopicsLite(): Promise<TopicLite[]> {
  const { data, error } = await supabase
    .from('topics')
    .select('id, term, status, detected_at')
    .is('archived_at', null)
    .order('detected_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return data
}

type JobLite = { topic_id: string | null; error: string | null; created_at: string }

async function fetchFailedJobErrors(): Promise<JobLite[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('topic_id, error, created_at')
    .not('error', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return data
}

type ItemLite = Pick<ContentItem, 'id' | 'title' | 'status' | 'metadata' | 'created_at' | 'published_at'>

async function fetchContentItemsLite(): Promise<ItemLite[]> {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, title, status, metadata, created_at, published_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return data
}

export default function Automacao() {
  const queryClient = useQueryClient()
  const { data: automation } = useQuery({
    queryKey: ['settings', 'autopilot'],
    queryFn: fetchAutomationSettings,
    refetchInterval: 5000,
  })
  const { data: topics } = useQuery({ queryKey: ['topics'], queryFn: fetchTopicsLite })
  const { data: jobErrors } = useQuery({ queryKey: ['jobs', 'errors'], queryFn: fetchFailedJobErrors, refetchInterval: 5000 })
  const { data: items } = useQuery({ queryKey: ['content_items'], queryFn: fetchContentItemsLite })

  const autopilot = automation?.autopilot ?? DEFAULT_AUTOPILOT
  const requireManualEveryN = automation?.limits.require_manual_edit_every_n ?? 0

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data: userData } = await supabase.auth.getUser()
      const nowIso = new Date().toISOString()
      const value: AutopilotSettings = {
        ...autopilot,
        enabled,
        ...(enabled
          ? { started_by: userData.user?.email ?? null, started_at: nowIso }
          : { stopped_by: userData.user?.email ?? null, stopped_at: nowIso }),
      }
      const { error } = await supabase.from('settings').update({ value: value as never }).eq('key', 'autopilot')
      if (error) throw new Error(error.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['settings', 'autopilot'] }),
  })

  const retryTopic = useMutation({
    mutationFn: async (topicId: string) => {
      const { error } = await supabase.from('topics').update({ status: 'approved_for_gen' }).eq('id', topicId)
      if (error) throw new Error(error.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['topics'] }),
  })

  const counts = (topics ?? []).reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1
    return acc
  }, {})

  const failedTopics = (topics ?? []).filter((t) => t.status === 'failed')
  const lastErrorByTopic = new Map<string, string>()
  for (const j of jobErrors ?? []) {
    if (j.topic_id && j.error && !lastErrorByTopic.has(j.topic_id)) lastErrorByTopic.set(j.topic_id, j.error)
  }

  const pendingReview = (items ?? []).filter((i) => i.status === 'pending_review')
  const needsHuman = pendingReview.filter((i) => {
    const meta = i.metadata as { originality?: OriginalityMeta } | null
    return meta?.originality?.verdict !== 'pass'
  })
  const readyForAutopilot = pendingReview.length - needsHuman.length

  const publishedToday = (items ?? []).filter(
    (i) => i.status === 'published' && i.published_at && Date.now() - new Date(i.published_at).getTime() < 24 * 3600 * 1000,
  ).length

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Piloto automático</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Deteta, gera e publica sozinho — sem clique por artigo — até desligares. Só publica o que o motor
              editorial validou sem reservas; o resto fica em baixo, à espera de ti.
            </p>
            {autopilot.enabled ? (
              <p className="mt-2 text-xs text-green-700">
                🟢 Ligado{autopilot.started_by ? ` por ${autopilot.started_by}` : ''}
                {autopilot.started_at ? ` às ${new Date(autopilot.started_at).toLocaleString('pt')}` : ''}
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                ⚪ Desligado
                {autopilot.stopped_at ? ` — parado às ${new Date(autopilot.stopped_at).toLocaleString('pt')}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={() => toggle.mutate(!autopilot.enabled)}
            disabled={toggle.isPending}
            className={`rounded-md px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
              autopilot.enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {toggle.isPending ? 'A aplicar…' : autopilot.enabled ? '⏸ Parar piloto automático' : '▶ Ligar piloto automático'}
          </button>
        </div>
        {toggle.isError && <p className="mt-2 text-sm text-red-600">Falhou: {toggle.error.message}</p>}
        {autopilot.enabled && <BackendHealth lastTickAt={autopilot.last_tick_at ?? null} />}
        {autopilot.enabled && autopilot.last_error && (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            ⚠️ Última verificação com erro: {autopilot.last_error}
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Na fila para gerar" value={(counts.approved_for_gen ?? 0) + (counts.processing ?? 0)} />
        <Stat label="Prontos p/ publicar sozinho" value={readyForAutopilot} tone="green" />
        <Stat label="Publicados (24h)" value={publishedToday} tone="green" />
        <Stat label="Precisam de ti" value={needsHuman.length + failedTopics.length} tone={needsHuman.length + failedTopics.length > 0 ? 'amber' : undefined} />
      </section>

      {requireManualEveryN > 0 && (
        <p className="text-xs text-slate-500">
          Ritmo de revisão manual: a cada {requireManualEveryN} publicações automáticas seguidas, a próxima fica
          reservada para revisão humana ({autopilot.auto_published_streak ?? 0}/{requireManualEveryN} desde a última).
        </p>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Precisa de ação humana <span className="text-slate-400">({needsHuman.length + failedTopics.length})</span>
        </h2>

        {needsHuman.length === 0 && failedTopics.length === 0 && (
          <p className="text-sm text-slate-500">Nada à espera de ti agora. 🎉</p>
        )}

        {failedTopics.length > 0 && (
          <div className="mb-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-red-700">
              Falhas de geração ({failedTopics.length})
            </h3>
            {failedTopics.map((t) => {
              const techError = lastErrorByTopic.get(t.id)
              return (
                <div key={t.id} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-medium text-slate-800">{t.term}</p>
                    <button
                      onClick={() => retryTopic.mutate(t.id)}
                      disabled={retryTopic.isPending}
                      className="shrink-0 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Tentar novamente
                    </button>
                  </div>
                  {techError && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-red-700">Erro técnico</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-white/60 p-2 text-xs text-red-800">
                        {techError}
                      </pre>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {needsHuman.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Por rever manualmente ({needsHuman.length}) — o piloto automático não os publica
            </h3>
            {needsHuman.map((i) => {
              const meta = i.metadata as { originality?: OriginalityMeta } | null
              return (
                <Link
                  key={i.id}
                  to="/admin/revisao"
                  className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm hover:border-amber-400"
                >
                  <span className="truncate font-medium text-slate-800">{i.title ?? '(sem título)'}</span>
                  <span className="shrink-0 text-xs text-amber-700">
                    {meta?.originality?.verdict === 'review' ? '🟡 verificar' : 'ver na fila de revisão →'}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * "Está ligado" (settings.autopilot.enabled) e "está mesmo a correr" são coisas
 * diferentes — ligar o interruptor não arranca nada sozinho, só diz ao backend
 * para agir quando ele passar por aqui. Se o processo não estiver de pé (ex.:
 * terminal fechado, crash), fica ligado para sempre sem fazer nada e sem erro
 * nenhum — daqui vem essa distinção, a partir de `last_tick_at`
 * (autopilot_tick grava-o a cada ~20s enquanto o processo está vivo).
 */
function BackendHealth({ lastTickAt }: { lastTickAt: string | null }) {
  if (!lastTickAt) {
    return (
      <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
        ⚠️ O backend ainda não confirmou nenhum ciclo desde que ligaste. Confirma que o <code>uvicorn</code> está a
        correr.
      </p>
    )
  }
  const minutesAgo = (Date.now() - new Date(lastTickAt).getTime()) / 60000
  if (minutesAgo > STALE_TICK_MINUTES) {
    return (
      <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
        ⚠️ O backend não dá sinal há {Math.round(minutesAgo)} min (devia confirmar a cada ~20s). O interruptor está
        ligado, mas o piloto não está a correr — o processo (<code>uvicorn</code>) provavelmente parou ou não está a
        correr. Nada acontece até o reiniciares.
      </p>
    )
  }
  return <p className="mt-3 text-xs text-slate-400">🟢 Backend ativo — última verificação há {Math.round(minutesAgo * 60)}s.</p>
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' }) {
  const toneClass = tone === 'green' ? 'text-green-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  )
}
