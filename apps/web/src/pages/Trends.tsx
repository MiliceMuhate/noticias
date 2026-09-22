import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Job, Topic } from '@repo/shared'
import { supabase } from '../lib/supabase'

/** Vista de tendências: termo, score, momentum e estado, atualizada ao vivo. */

type TopicWithJobs = Topic & { jobs: Pick<Job, 'status' | 'error' | 'created_at'>[] }

async function fetchTopics(): Promise<TopicWithJobs[]> {
  const { data, error } = await supabase
    .from('topics')
    .select('*, jobs(status, error, created_at)')
    .order('detected_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return data as unknown as TopicWithJobs[]
}

function lastError(topic: TopicWithJobs): string | null {
  const failed = topic.jobs
    .filter((j) => j.error)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return failed[0]?.error ?? null
}

const MOMENTUM_ICON: Record<string, string> = { rising: '📈', peaked: '⏸️', falling: '📉' }

const STATUS_LABELS: Record<string, string> = {
  detected: 'detetado',
  scored: 'pontuado',
  approved_for_gen: '⏳ na fila para gerar',
  processing: '⏳ a gerar…',
  generated: '✅ gerado',
  rejected: 'rejeitado',
  failed: '❌ falhou',
}

export default function Trends() {
  const queryClient = useQueryClient()
  const { data: topics, isLoading, error } = useQuery({ queryKey: ['topics'], queryFn: fetchTopics })

  // aprovação manual (ou repetição) de um topic para geração. A geração em si
  // não é instantânea: o backend só a processa no próximo ciclo do scheduler
  // (por omissão a cada 2 min — ver GENERATE_POLL_INTERVAL_MIN).
  const approveForGen = useMutation({
    mutationFn: async (topic: TopicWithJobs) => {
      const { error: e } = await supabase
        .from('topics')
        .update({ status: 'approved_for_gen' })
        .eq('id', topic.id)
      if (e) throw new Error(e.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['topics'] }),
  })

  if (isLoading) return <p className="text-slate-500">A carregar tendências…</p>
  if (error) return <p className="text-red-600">Erro: {(error as Error).message}</p>

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Termo</th>
            <th className="px-4 py-3">Região</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Momentum</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Detetado</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {(topics ?? []).map((t) => {
            const isThisTopic = approveForGen.variables?.id === t.id
            const requesting = approveForGen.isPending && isThisTopic
            const requestFailed = approveForGen.isError && isThisTopic
            const justRequested = approveForGen.isSuccess && isThisTopic && t.status === 'approved_for_gen'
            const error = t.status === 'failed' ? lastError(t) : null

            return (
              <tr key={t.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">{t.term}</td>
                <td className="px-4 py-2 text-slate-500">{t.region}</td>
                <td className="px-4 py-2 tabular-nums">{t.score?.toFixed(2) ?? '—'}</td>
                <td className="px-4 py-2">
                  {t.momentum ? `${MOMENTUM_ICON[t.momentum] ?? ''} ${t.momentum}` : '—'}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      t.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-slate-100'
                    }`}
                  >
                    {STATUS_LABELS[t.status] ?? t.status}
                  </span>
                  {t.status === 'generated' && (
                    <Link to="/admin/revisao" className="ml-2 text-xs font-medium text-blue-600 hover:underline">
                      ver na fila de revisão
                    </Link>
                  )}
                  {error && <p className="mt-1 max-w-xs text-xs text-red-600" title={error}>{error}</p>}
                </td>
                <td className="px-4 py-2 text-slate-500">{new Date(t.detected_at).toLocaleString('pt')}</td>
                <td className="px-4 py-2 text-right">
                  {(t.status === 'scored' || t.status === 'failed') && (
                    <button
                      onClick={() => approveForGen.mutate(t)}
                      disabled={requesting}
                      className={`rounded-md px-3 py-1 text-xs font-medium text-white disabled:opacity-50 ${
                        t.status === 'failed' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-700'
                      }`}
                    >
                      {requesting ? 'A pedir…' : t.status === 'failed' ? 'Tentar novamente' : 'Gerar artigo'}
                    </button>
                  )}
                  {requestFailed && (
                    <p className="mt-1 text-xs text-red-600">Falhou: {approveForGen.error.message}</p>
                  )}
                  {justRequested && (
                    <p className="mt-1 text-xs text-slate-400">
                      Pedido enviado — processa no próximo ciclo do backend (poucos minutos).
                    </p>
                  )}
                </td>
              </tr>
            )
          })}
          {(topics ?? []).length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                Sem tendências ainda — a deteção de artigos vai preencher isto.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
