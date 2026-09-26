import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Job, Topic } from '@repo/shared'
import { supabase } from '../lib/supabase'

/** Vista de tendências: termo, score, momentum e estado, atualizada ao vivo. */

type TopicWithJobs = Topic & { jobs: Pick<Job, 'status' | 'error' | 'created_at'>[] }
type SearchResult = { title: string; url: string; status: 'added' | 'duplicate' | 'unreadable' | 'skipped'; reason: string }
type SearchReport = { query: string; searched: number; remaining_today: number; results: SearchResult[] }

async function fetchTopics(archived: boolean): Promise<TopicWithJobs[]> {
  const query = supabase
    .from('topics')
    .select('*, jobs(status, error, created_at)')
    .order('detected_at', { ascending: false })
    .limit(100)
  const { data, error } = await (archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null))
  if (error) throw new Error(error.message)
  return data as unknown as TopicWithJobs[]
}

function lastError(topic: TopicWithJobs): string | null {
  const failed = (topic.jobs ?? [])
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
  const [showArchived, setShowArchived] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('football soccer')
  const { data: topics, isLoading, error } = useQuery({
    queryKey: ['topics', showArchived ? 'archived' : 'active'],
    queryFn: () => fetchTopics(showArchived),
  })

  const archive = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('archive_finished_topics')
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (count) => {
      setNotice(`${count} tendências arquivadas. Os artigos e erros continuam guardados.`)
      void queryClient.invalidateQueries({ queryKey: ['topics'] })
    },
  })

  const restore = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('restore_archived_topics')
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (count) => {
      setNotice(`${count} tendências restauradas.`)
      void queryClient.invalidateQueries({ queryKey: ['topics'] })
    },
  })

  const searchNews = useMutation({
    mutationFn: async (): Promise<SearchReport> => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sessão expirada — volta a entrar no painel.')
      const response = await fetch('/api/admin/news/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: searchTerm.trim() }),
      })
      const body = (await response.json().catch(() => ({}))) as SearchReport & { detail?: string }
      if (!response.ok) throw new Error(body.detail ?? `HTTP ${response.status}`)
      return body
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['topics'] }),
  })

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
    <div className="space-y-3">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Pesquisar notícias na web</h2>
        <p className="mt-1 text-xs text-slate-500">
          Pesquisa notícias das últimas 24 horas (até 8 resultados). Verifica repetições e se consegue ler a fonte.
          As novas entram em Tendências para decidires se queres gerar um artigo; este botão não usa a IA.
          Limite de 10 pesquisas em 24 horas.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            maxLength={100}
            aria-label="Termos de pesquisa"
            className="min-w-52 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Ex.: football soccer"
          />
          <button
            type="button"
            onClick={() => searchNews.mutate()}
            disabled={searchNews.isPending || searchTerm.trim().length < 3}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {searchNews.isPending ? 'A pesquisar e verificar fontes…' : 'Pesquisar notícias agora'}
          </button>
        </div>
        {searchNews.isError && <p className="mt-2 text-sm text-red-700">{searchNews.error.message}</p>}
        {searchNews.data && (
          <div className="mt-3 text-sm">
            <p className="font-medium">{searchNews.data.searched} resultados · {searchNews.data.results.filter((r) => r.status === 'added').length} novos · {searchNews.data.remaining_today} pesquisas disponíveis nas próximas 24h</p>
            <ul className="mt-2 space-y-2">
              {searchNews.data.results.map((result, i) => (
                <li key={`${result.url}-${i}`} className="rounded-md border border-slate-200 px-3 py-2">
                  <a href={result.url} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">{result.title}</a>
                  <p className={result.status === 'added' ? 'text-green-700' : 'text-slate-600'}>{result.status === 'added' ? 'Adicionada' : 'Ignorada'}: {result.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => { setShowArchived(!showArchived); setNotice(null) }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
        >
          {showArchived ? 'Ver tendências atuais' : 'Ver arquivadas'}
        </button>
        {showArchived ? (
          <button
            type="button"
            disabled={restore.isPending}
            onClick={() => { if (window.confirm('Restaurar todas as tendências arquivadas?')) restore.mutate() }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Restaurar todas
          </button>
        ) : (
          <button
            type="button"
            disabled={archive.isPending}
            onClick={() => {
              if (window.confirm('Arquivar tendências concluídas, rejeitadas e falhadas? Notícias na fila ou em geração ficam visíveis. Os dados não serão apagados.')) archive.mutate()
            }}
            className="rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-900 disabled:opacity-50"
          >
            {archive.isPending ? 'A arquivar…' : 'Arquivar histórico'}
          </button>
        )}
      </div>
      {notice && <p className="text-sm text-slate-700">{notice}</p>}
      {(archive.error || restore.error) && (
        <p className="text-sm text-red-700">Erro: {(archive.error ?? restore.error)?.message}</p>
      )}
      <p className="text-xs text-slate-500">
        O arquivo limpa a lista e preserva os registos. Uma notícia já detetada hoje só volta a entrar amanhã se continuar no RSS.
      </p>
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
                  {!showArchived && (t.status === 'scored' || t.status === 'failed') && (
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
                {showArchived ? 'Nenhuma tendência arquivada.' : 'Sem tendências atuais — as próximas deteções aparecerão aqui.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}
