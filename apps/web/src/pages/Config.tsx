import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Source } from '@repo/shared'
import { supabase } from '../lib/supabase'

/** Configuração: fontes de tendências de futebol (ligar/desligar). */

export default function Config() {
  return (
    <div className="space-y-8">
      <SourcesSection />
    </div>
  )
}

function SourcesSection() {
  const queryClient = useQueryClient()
  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: async (): Promise<Source[]> => {
      const { data, error } = await supabase.from('sources').select('*').order('created_at')
      if (error) throw new Error(error.message)
      return data
    },
  })

  const toggle = useMutation({
    mutationFn: async (source: Source) => {
      const { error } = await supabase.from('sources').update({ enabled: !source.enabled }).eq('id', source.id)
      if (error) throw new Error(error.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
  })

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-slate-900">Fontes de tendências</h2>
      <div className="space-y-2">
        {(sources ?? []).map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            <div>
              <span className="font-medium text-slate-800">{s.kind}</span>
              <span className="ml-2 text-slate-500">nicho: {s.niche}</span>
              <pre className="mt-1 text-xs text-slate-400">{JSON.stringify(s.config)}</pre>
            </div>
            <button
              onClick={() => toggle.mutate(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                s.enabled ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {s.enabled ? 'ativa' : 'inativa'}
            </button>
          </div>
        ))}
        {(sources ?? []).length === 0 && <p className="text-sm text-slate-500">Sem fontes configuradas.</p>}
      </div>
    </section>
  )
}
