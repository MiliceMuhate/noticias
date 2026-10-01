import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Motivos das notícias recusadas/falhadas e revisão em lote (Tendências).
 * O motivo vem do backend (apps/api/app/services/rejections.py) — quando foi a
 * IA a recusar, é a explicação que ela própria deu. "Rever todas" devolve à
 * fila de geração todas as notícias não arquivadas com esse motivo, com as
 * tentativas contadas de novo (review_requested_at).
 */

// espelha CATEGORY_LABELS em apps/api/app/services/rejections.py
export const REJECTION_LABELS: Record<string, string> = {
  pontuacao: 'Pontuação baixa',
  nao_futebol: 'Não é futebol',
  sem_conteudo: 'Fonte sem conteúdo',
  inviavel: 'Recusada pela redação',
  duplicado: 'Duplicada',
  ia_sem_saldo: 'IA sem saldo/quota',
  resposta_cortada: 'Resposta da IA cortada',
  fonte_inacessivel: 'Fonte inacessível',
  originalidade: 'Demasiado parecida com a fonte',
  auditoria: 'Chumbada na auditoria',
  estrutura: 'Estrutura/comprimento',
  erro_tecnico: 'Erro técnico',
}

// aviso mostrado antes de rever em lote — o que vai acontecer de facto
const BULK_WARNING: Record<string, string> = {
  ia_sem_saldo: 'Confirma primeiro que o provedor de IA já tem saldo (ou que mudaste de provedor) — senão voltam a falhar.',
  pontuacao: 'Foram recusadas por não terem as palavras-chave da fonte — muitas podem não ser de futebol. A redação volta a avaliá-las (e cobra por isso).',
  nao_futebol: 'A IA disse que não são de futebol. É provável que volte a recusar a maioria.',
  fonte_inacessivel: 'Se o site continuar a bloquear o servidor, voltam a falhar sem custo de IA.',
}

const NO_BULK = new Set(['duplicado'])

/** Pedido de revisão: volta à fila de geração, motivo limpo, tentativas do zero. */
export function reviewPatch() {
  return {
    status: 'approved_for_gen' as const,
    review_requested_at: new Date().toISOString(),
    rejection_category: null,
    rejection_reason: null,
  }
}

async function fetchCounts(): Promise<{ category: string; count: number }[]> {
  const { data, error } = await supabase
    .from('topics')
    .select('rejection_category')
    .in('status', ['rejected', 'failed'])
    .is('archived_at', null)
    .not('rejection_category', 'is', null)
    .limit(5000)
  if (error) throw new Error(error.message)
  const counts = new Map<string, number>()
  for (const row of data) counts.set(row.rejection_category!, (counts.get(row.rejection_category!) ?? 0) + 1)
  return [...counts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count)
}

/** custo médio real de um artigo nos últimos 7 dias — para a estimativa antes de confirmar */
async function fetchAvgCost(): Promise<number | null> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('jobs')
    .select('cost_usd')
    .eq('type', 'generate-article')
    .eq('status', 'done')
    .gte('created_at', since)
    .gt('cost_usd', 0)
    .limit(500)
  if (error || !data.length) return null
  return data.reduce((a, j) => a + Number(j.cost_usd), 0) / data.length
}

export default function RejectedReview() {
  const queryClient = useQueryClient()
  const { data: counts } = useQuery({ queryKey: ['topics', 'rejection_counts'], queryFn: fetchCounts })
  const { data: avgCost } = useQuery({ queryKey: ['jobs', 'avg_cost'], queryFn: fetchAvgCost, staleTime: 10 * 60_000 })

  const bulk = useMutation({
    mutationFn: async (category: string) => {
      const { data, error } = await supabase
        .from('topics')
        .update(reviewPatch())
        .in('status', ['rejected', 'failed'])
        .eq('rejection_category', category)
        .is('archived_at', null)
        .select('id')
      if (error) throw new Error(error.message)
      return data.length
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['topics'] }),
  })

  if (!counts || counts.length === 0) return null

  function confirmBulk(category: string, count: number) {
    const cost = avgCost ? ` Custo estimado: até ~$${(avgCost * count).toFixed(2)} (média de $${avgCost.toFixed(3)} por artigo nos últimos 7 dias).` : ''
    const warning = BULK_WARNING[category] ? `\n\n${BULK_WARNING[category]}` : ''
    if (window.confirm(`Pedir revisão de ${count} notícia(s) — “${REJECTION_LABELS[category] ?? category}”?${cost}${warning}`)) {
      bulk.mutate(category)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-1 text-sm font-semibold text-slate-900">Notícias negadas, por motivo</p>
      <p className="mb-3 text-xs text-slate-500">
        “Rever todas” devolve-as à fila de geração com as tentativas do zero. O backend processa ~5 a cada 2 minutos.
      </p>
      <div className="flex flex-wrap gap-2">
        {counts.map(({ category, count }) => (
          <div key={category} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
            <span className="text-slate-700">{REJECTION_LABELS[category] ?? category}</span>
            <span className="rounded-full bg-slate-100 px-2 text-xs tabular-nums text-slate-600">{count}</span>
            <button
              onClick={() => confirmBulk(category, count)}
              disabled={bulk.isPending || NO_BULK.has(category)}
              title={NO_BULK.has(category) ? 'Duplicadas: já existe um artigo para estas notícias' : undefined}
              className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"
            >
              {bulk.isPending && bulk.variables === category ? 'A pedir…' : 'Rever todas'}
            </button>
          </div>
        ))}
      </div>
      {bulk.isSuccess && <p className="mt-2 text-xs text-green-700">{bulk.data} notícia(s) de volta à fila de geração.</p>}
      {bulk.isError && <p className="mt-2 text-xs text-red-600">Falhou: {bulk.error.message}</p>}
    </div>
  )
}
