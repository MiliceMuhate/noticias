import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Source } from '@repo/shared'
import { supabase } from '../lib/supabase'
import AiProvidersSection from './config/AiProvidersSection'
import EditorialSection from './config/EditorialSection'
import TranslationSection from './config/TranslationSection'
import VoiceSection from './config/VoiceSection'

/**
 * Configuração — tudo o que muda o comportamento do sistema sem deploy (lido
 * pelo backend a cada ciclo, a partir de `settings`). Separadores no URL
 * (?sec=...) para se poder partilhar/voltar a um sítio.
 */

const TABS = [
  { key: 'publicacao', label: 'Publicação' },
  { key: 'editorial', label: 'Motor editorial' },
  { key: 'ia', label: 'Provedores de IA' },
  { key: 'voz', label: 'Voz e autoria' },
  { key: 'traducoes', label: 'Traduções' },
  { key: 'fontes', label: 'Fontes' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function Config() {
  const [params, setParams] = useSearchParams()
  const current = (TABS.find((t) => t.key === params.get('sec'))?.key ?? 'publicacao') as TabKey

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ sec: t.key }, { replace: true })}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              current === t.key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {current === 'publicacao' && <PublishingLimitsSection />}
      {current === 'editorial' && <EditorialSection />}
      {current === 'ia' && <AiProvidersSection />}
      {current === 'voz' && <VoiceSection />}
      {current === 'traducoes' && <TranslationSection />}
      {current === 'fontes' && <SourcesSection />}
    </div>
  )
}

interface PublishingLimits {
  max_published_per_day: number
  max_per_source_per_day: number
  require_manual_edit_every_n: number
}

const LIMIT_FIELDS: { key: keyof PublishingLimits; label: string; hint: string }[] = [
  {
    key: 'max_published_per_day',
    label: 'Máx. publicações por dia',
    hint: 'Imposto na base de dados — mesmo o piloto automático não consegue ultrapassar.',
  },
  {
    key: 'max_per_source_per_day',
    label: 'Máx. por fonte, por dia',
    hint: 'Só aplicado pelo piloto automático (não há equivalente na base de dados). 0 desativa.',
  },
  {
    key: 'require_manual_edit_every_n',
    label: 'Reservar 1 em cada N para revisão manual',
    hint: 'Só aplicado pelo piloto automático — a cada N publicações automáticas seguidas, a próxima fica à espera de um humano. 0 desativa.',
  },
]

// espelha supabase/seed.sql — usado quando a linha ainda não existe na BD (ex.:
// seed nunca aplicado a um projeto hosted) em vez de partir a página.
const DEFAULT_PUBLISHING_LIMITS: PublishingLimits = {
  max_published_per_day: 50,
  max_per_source_per_day: 6,
  require_manual_edit_every_n: 5,
}

async function fetchPublishingLimits(): Promise<PublishingLimits> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'publishing_limits').maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.value as unknown as PublishingLimits | undefined) ?? DEFAULT_PUBLISHING_LIMITS
}

function PublishingLimitsSection() {
  const queryClient = useQueryClient()
  const { data: limits, isLoading } = useQuery({ queryKey: ['settings', 'publishing_limits'], queryFn: fetchPublishingLimits })
  const [draft, setDraft] = useState<PublishingLimits | null>(null)

  useEffect(() => {
    if (limits && !draft) setDraft(limits)
  }, [limits, draft])

  const save = useMutation({
    mutationFn: async (value: PublishingLimits) => {
      // upsert, não update: se a linha não existir (já aconteceu neste projeto —
      // seed.sql nunca chegou a correr no hosted), um update fica em silêncio,
      // sem gravar nada e sem erro nenhum
      const { error } = await supabase.from('settings').upsert({ key: 'publishing_limits', value: value as never })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'publishing_limits'] }),
  })

  const dirty = !!draft && !!limits && JSON.stringify(draft) !== JSON.stringify(limits)

  if (isLoading || !draft) return <p className="text-sm text-slate-500">A carregar limites…</p>

  return (
    <section>
      <h2 className="mb-1 text-base font-semibold text-slate-900">Ritmo de publicação</h2>
      <p className="mb-3 text-sm text-slate-500">
        Aplica-se a toda a publicação, manual ou automática (ver <code>settings.publishing_limits</code>).
      </p>
      <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        {LIMIT_FIELDS.map(({ key, label, hint }) => (
          <label key={key} className="block text-sm">
            <span className="font-medium text-slate-700">{label}</span>
            <input
              type="number"
              min={0}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: Math.max(0, Number(e.target.value) || 0) })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <span className="mt-1 block text-xs text-slate-400">{hint}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => save.mutate(draft)}
          disabled={!dirty || save.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {save.isPending ? 'A guardar…' : 'Guardar'}
        </button>
        {dirty && !save.isPending && <span className="text-xs text-amber-600">Alterações por guardar</span>}
        {save.isSuccess && !dirty && <span className="text-xs text-green-600">Guardado.</span>}
        {save.isError && <span className="text-xs text-red-600">Falhou: {save.error.message}</span>}
      </div>
    </section>
  )
}

function SourcesSection() {
  const queryClient = useQueryClient()
  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: async (): Promise<Source[]> => {
      const { data, error } = await supabase.from('sources').select('*').eq('kind', 'rss').order('created_at')
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
            className="flex flex-col items-start gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <span className="font-medium text-slate-800">{s.kind}</span>
              <span className="ml-2 text-slate-500">nicho: {s.niche}</span>
              <pre className="mt-1 whitespace-pre-wrap break-all text-xs text-slate-400">{JSON.stringify(s.config)}</pre>
            </div>
            <button
              onClick={() => toggle.mutate(s)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
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
