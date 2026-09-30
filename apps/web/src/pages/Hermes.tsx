import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { HermesRun } from '@repo/shared'
import { apiPost } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Field, LinesInput, Loading, NumberInput, SaveBar, Section, Select, TextArea, TextInput, Toggle } from './config/fields'
import { useSetting } from './config/useSetting'

/**
 * Hermes (Nous Research) — agente de DESCOBERTA de notícias (Fase 8,
 * docs/TASKS.md). Procura notícias nos domínios aprovados e cruza cada uma com
 * outras fontes; o resultado entra em Tendências e segue a cadeia editorial de
 * sempre. Nunca escreve nem publica. Backend: apps/api/app/services/hermes.py.
 */

interface HermesSettings {
  enabled: boolean
  interval_min: number
  max_stories: number
  min_sources: number
  focus: string
  allowed_domains: string[]
  provider: 'openai_compatible' | 'openrouter' | 'anthropic' | 'gemini'
  base_url: string
  model: string
  provider_flag: string
  reasoning: string
  web_backend: 'keyless' | 'brave-free' | 'tavily' | 'exa' | 'firecrawl'
  max_turns: number
  timeout_sec: number
  input_usd_per_mtok: number | null
  output_usd_per_mtok: number | null
  cache_read_usd_per_mtok: number | null
}

// espelha DEFAULT_HERMES em apps/api/app/services/hermes.py
const DEFAULT_HERMES: HermesSettings = {
  enabled: false,
  interval_min: 60,
  max_stories: 5,
  min_sources: 2,
  focus: '',
  allowed_domains: [],
  provider: 'gemini',
  base_url: '',
  model: 'gemini-3.8-flash',
  provider_flag: '',
  reasoning: 'low',
  web_backend: 'keyless',
  max_turns: 40,
  timeout_sec: 900,
  input_usd_per_mtok: null,
  output_usd_per_mtok: null,
  cache_read_usd_per_mtok: null,
}

const LLM_KEY_ID = 'hermes'
const SEARCH_KEY_ID = 'hermes-search'

async function fetchRuns(): Promise<HermesRun[]> {
  const { data, error } = await supabase.from('hermes_runs').select('*').order('started_at', { ascending: false }).limit(200)
  if (error) throw new Error(error.message)
  return data
}

function formatUsd(v: number): string {
  if (!v) return '$0.00'
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`
}

function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

export default function Hermes() {
  const settings = useSetting('hermes', DEFAULT_HERMES)
  const { data: runs } = useQuery({
    queryKey: ['hermes_runs'],
    queryFn: fetchRuns,
    // enquanto houver uma execução a correr, atualiza sozinho
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === 'running') ? 5000 : 30_000),
  })

  if (settings.isLoading || !settings.draft) return <Loading what="Hermes" />

  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-600">
        O Hermes procura notícias nos sites aprovados e confirma cada uma noutras fontes. O que encontra entra em
        <strong> Tendências</strong> e segue a cadeia editorial de sempre (reescrita, verificações, aprovação ou piloto).{' '}
        <strong>Nunca escreve nem publica.</strong>
      </p>
      <StatusSection settings={settings} runs={runs ?? []} />
      <CostsSection runs={runs ?? []} />
      <KeysSection />
      <ConfigSection settings={settings} />
      <RunsSection runs={runs ?? []} />
    </div>
  )
}

type SettingState = ReturnType<typeof useSetting<HermesSettings>>

function StatusSection({ settings, runs }: { settings: SettingState; runs: HermesRun[] }) {
  const queryClient = useQueryClient()
  const draft = settings.draft!
  const running = runs.find((r) => r.status === 'running')
  const last = runs.find((r) => r.status !== 'running')
  const runNow = useMutation({
    mutationFn: () => apiPost<{ status: string }>('/admin/hermes/run'),
    onSuccess: () => window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['hermes_runs'] }), 1500),
  })

  return (
    <Section title="Estado">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm">
          {running ? (
            <p className="font-medium text-blue-700">⏳ A procurar notícias… (desde {new Date(running.started_at).toLocaleTimeString('pt')})</p>
          ) : last ? (
            <p className={last.status === 'done' ? 'text-green-700' : 'text-red-700'}>
              Última execução {new Date(last.started_at).toLocaleString('pt')}:{' '}
              {last.status === 'done' ? `${last.stories_inserted} notícia(s) nova(s)` : `falhou — ${last.error ?? ''}`}
            </p>
          ) : (
            <p className="text-slate-500">Ainda não correu.</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {draft.enabled
              ? `Automático: a cada ${draft.interval_min} min.`
              : 'Automático desligado — só corre com “Executar agora”.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending || !!running}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {running ? 'A correr…' : runNow.isPending ? 'A iniciar…' : '▶ Executar agora'}
          </button>
        </div>
      </div>
      {runNow.isError && <p className="mt-2 text-xs text-red-600">Não arrancou: {runNow.error.message}</p>}
      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <Toggle
          checked={draft.enabled}
          onChange={(enabled) => settings.setDraft({ ...draft, enabled })}
          label={<strong>Procurar automaticamente</strong>}
        />
        <Field label="De quanto em quanto tempo (minutos)" hint="Cada execução custa tokens — ver Gastos abaixo.">
          <NumberInput value={draft.interval_min} min={15} step={15} onChange={(interval_min) => settings.setDraft({ ...draft, interval_min: Math.max(15, interval_min) })} />
        </Field>
      </div>
      <SaveBar dirty={settings.dirty} save={settings.save} value={settings.draft} />
    </Section>
  )
}

function CostsSection({ runs }: { runs: HermesRun[] }) {
  const now = Date.now()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(startOfDay)
  startOfMonth.setDate(1)
  const sum = (since: number) => {
    const rs = runs.filter((r) => new Date(r.started_at).getTime() >= since)
    return {
      cost: rs.reduce((a, r) => a + Number(r.cost_usd || 0), 0),
      runs: rs.length,
      stories: rs.reduce((a, r) => a + (r.stories_inserted || 0), 0),
      tokensIn: rs.reduce((a, r) => a + (r.input_tokens || 0), 0),
      tokensOut: rs.reduce((a, r) => a + (r.output_tokens || 0), 0),
    }
  }
  const periods = [
    { label: 'Hoje', ...sum(startOfDay.getTime()) },
    { label: 'Últimos 7 dias', ...sum(now - 7 * 86_400_000) },
    { label: 'Este mês', ...sum(startOfMonth.getTime()) },
  ]
  const month = periods[2]!
  const finished = runs.filter((r) => r.status !== 'running')
  const avgRun = finished.length ? finished.reduce((a, r) => a + Number(r.cost_usd || 0), 0) / finished.length : 0

  return (
    <Section
      title="Gastos com o Hermes"
      description="Só a pesquisa e o cruzamento de fontes. A reescrita dos artigos que o Hermes encontra conta na aba “Gastos IA”, como as outras."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {periods.map((p) => (
          <div key={p.label} className="rounded-md border border-slate-100 p-3">
            <p className="text-xs text-slate-500">{p.label}</p>
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatUsd(p.cost)}</p>
            <p className="text-xs text-slate-500">
              {p.runs} execuções · {p.stories} notícias · {formatTokens(p.tokensIn)}/{formatTokens(p.tokensOut)} tokens
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Média por execução: <strong>{formatUsd(avgRun)}</strong>
        {month.stories > 0 && (
          <>
            {' '}· custo por notícia encontrada este mês: <strong>{formatUsd(month.cost / month.stories)}</strong>
          </>
        )}
        . O custo usa os preços da configuração abaixo; se estiverem vazios, a estimativa do próprio Hermes.
      </p>
    </Section>
  )
}

function useKeyStatus() {
  return useQuery({
    queryKey: ['ai_provider_key_status'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.rpc('ai_provider_key_status')
      if (error) throw new Error(error.message)
      return Object.fromEntries((data ?? []).map((r) => [r.provider_id, r.updated_at]))
    },
  })
}

function KeysSection() {
  const status = useKeyStatus()
  return (
    <Section
      title="Chaves"
      description="Ficam encriptadas no Supabase Vault e só o backend as lê, a cada execução. Trocar aqui vale logo na execução seguinte — sem reiniciar nada."
    >
      <div className="space-y-4">
        <KeyField
          id={LLM_KEY_ID}
          label="Chave da IA do Hermes"
          hint="A do provedor escolhido na configuração (ex.: a chave do Google AI Studio para o Gemini)."
          updatedAt={status.data?.[LLM_KEY_ID] ?? null}
          onChanged={() => void status.refetch()}
        />
        <KeyField
          id={SEARCH_KEY_ID}
          label="Chave do serviço de pesquisa (opcional)"
          hint="Só para Brave, Tavily, Exa ou Firecrawl — a do serviço escolhido em “Pesquisa web”. Com a rede gratuita não é precisa."
          updatedAt={status.data?.[SEARCH_KEY_ID] ?? null}
          onChanged={() => void status.refetch()}
        />
      </div>
    </Section>
  )
}

function KeyField({ id, label, hint, updatedAt, onChanged }: { id: string; label: string; hint: string; updatedAt: string | null; onChanged: () => void }) {
  const [value, setValue] = useState('')
  const save = useMutation({
    mutationFn: async (key: string | null) => {
      const { error } = await supabase.rpc('set_ai_provider_key', { p_provider_id: id, p_key: key })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      setValue('')
      onChanged()
    },
  })
  return (
    <Field
      label={label}
      hint={
        <>
          {updatedAt ? `Guardada (${new Date(updatedAt).toLocaleString('pt')}). Escreve uma nova para substituir. ` : 'Ainda sem chave. '}
          {hint}
        </>
      }
    >
      <div className="flex gap-2">
        <TextInput type="password" value={value} onChange={setValue} placeholder={updatedAt ? '•••••••• (guardada)' : 'cola a chave'} />
        <button
          onClick={() => save.mutate(value)}
          disabled={!value.trim() || save.isPending}
          className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {save.isPending ? '…' : 'Guardar'}
        </button>
        {updatedAt && (
          <button
            onClick={() => window.confirm('Apagar esta chave?') && save.mutate(null)}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs"
          >
            Apagar
          </button>
        )}
      </div>
      {save.isError && <span className="text-xs text-red-600">Falhou: {save.error.message}</span>}
    </Field>
  )
}

function ConfigSection({ settings }: { settings: SettingState }) {
  const d = settings.draft!
  const set = (patch: Partial<HermesSettings>) => settings.setDraft({ ...d, ...patch })
  return (
    <Section title="Configuração">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="O que procurar" hint="Temas, competições, países. O Hermes usa isto para decidir o que pesquisar.">
            <TextArea value={d.focus} rows={2} onChange={(focus) => set({ focus })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Sites aprovados (um domínio por linha)"
            hint="O Hermes só pode usar estes sites; qualquer notícia ou confirmação de outro domínio é descartada pelo backend, não só pedida ao Hermes."
          >
            <LinesInput value={d.allowed_domains} onChange={(allowed_domains) => set({ allowed_domains })} rows={10} />
          </Field>
        </div>
        <Field label="Máximo de notícias por execução">
          <NumberInput value={d.max_stories} min={1} max={20} onChange={(max_stories) => set({ max_stories })} />
        </Field>
        <Field label="Mínimo de fontes diferentes por notícia" hint="Contando a principal. 2 = pelo menos uma confirmação noutro órgão.">
          <NumberInput value={d.min_sources} min={1} max={5} onChange={(min_sources) => set({ min_sources })} />
        </Field>

        <Field label="Provedor da IA do Hermes">
          <Select
            value={d.provider}
            onChange={(provider) => set({ provider })}
            options={[
              { value: 'gemini', label: 'Google Gemini (chave do Google AI Studio)' },
              { value: 'openrouter', label: 'OpenRouter' },
              { value: 'anthropic', label: 'Anthropic' },
              { value: 'openai_compatible', label: 'Outro compatível com OpenAI (URL base)' },
            ]}
          />
        </Field>
        <Field label="Modelo" hint="ex.: gemini-3.8-flash">
          <TextInput value={d.model} onChange={(model) => set({ model: model.trim() })} />
        </Field>
        {(d.provider === 'openai_compatible' || d.provider === 'anthropic') && (
          <Field label="URL base" hint={d.provider === 'openai_compatible' ? 'ex.: https://api.openai.com/v1' : 'vazio = API pública da Anthropic'}>
            <TextInput type="url" value={d.base_url} onChange={(base_url) => set({ base_url })} />
          </Field>
        )}
        <Field label="Valor de “--provider” (avançado)" hint="Só se o Hermes exigir um nome de provedor explícito. Vazio = não enviar.">
          <TextInput value={d.provider_flag} onChange={(provider_flag) => set({ provider_flag: provider_flag.trim() })} />
        </Field>
        <Field label="Raciocínio" hint="Quanto o modelo “pensa” antes de cada passo. Mais raciocínio = mais tokens = mais custo.">
          <Select
            value={d.reasoning || ''}
            onChange={(reasoning) => set({ reasoning })}
            options={[
              { value: '', label: 'Padrão do modelo' },
              { value: 'none', label: 'none' },
              { value: 'low', label: 'low (recomendado)' },
              { value: 'medium', label: 'medium' },
              { value: 'high', label: 'high' },
            ]}
          />
        </Field>
        <Field label="Pesquisa web">
          <Select
            value={d.web_backend}
            onChange={(web_backend) => set({ web_backend })}
            options={[
              { value: 'keyless', label: 'Rede gratuita do Hermes (sem chave) — recomendado para começar' },
              { value: 'brave-free', label: 'Brave Search (chave; lê páginas pela rede gratuita)' },
              { value: 'tavily', label: 'Tavily (chave paga)' },
              { value: 'exa', label: 'Exa (chave paga)' },
              { value: 'firecrawl', label: 'Firecrawl (chave paga)' },
            ]}
          />
        </Field>
        <Field label="Máximo de passos por execução" hint="Limita quantas pesquisas/leituras o Hermes faz — e portanto o custo.">
          <NumberInput value={d.max_turns} min={5} max={150} step={5} onChange={(max_turns) => set({ max_turns })} />
        </Field>
        <Field label="Tempo máximo por execução (segundos)">
          <NumberInput value={d.timeout_sec} min={120} max={1800} step={60} onChange={(timeout_sec) => set({ timeout_sec })} />
        </Field>
        <Field label="Preço de entrada (USD por 1M tokens)" hint="Gemini 3.8 Flash: 0,75 até 31/12/2026, 1,50 depois.">
          <NumberInput value={d.input_usd_per_mtok ?? 0} step={0.01} onChange={(v) => set({ input_usd_per_mtok: v || null })} />
        </Field>
        <Field label="Preço de saída (USD por 1M tokens)" hint="Gemini 3.8 Flash: 3,75 até 31/12/2026, 7,50 depois. Inclui o raciocínio.">
          <NumberInput value={d.output_usd_per_mtok ?? 0} step={0.01} onChange={(v) => set({ output_usd_per_mtok: v || null })} />
        </Field>
        <Field
          label="Preço de leitura de cache (USD por 1M tokens)"
          hint="O Hermes reaproveita contexto entre passos — numa pesquisa é a maior parte dos tokens. Vazio = 10% do preço de entrada (Gemini 3.8 Flash: 0,075)."
        >
          <NumberInput value={d.cache_read_usd_per_mtok ?? 0} step={0.005} onChange={(v) => set({ cache_read_usd_per_mtok: v || null })} />
        </Field>
      </div>
      <SaveBar dirty={settings.dirty} save={settings.save} value={settings.draft} />
    </Section>
  )
}

interface RunOutput {
  accepted?: {
    title: string
    primary_url: string
    primary_source: string
    national: boolean
    corroborating: { url: string; source: string; confirms: string[] }[]
    discrepancies: string[]
  }[]
  rejected?: string[]
}

function RunsSection({ runs }: { runs: HermesRun[] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Section title="Execuções">
      {runs.length === 0 && <p className="text-sm text-slate-500">Ainda sem execuções.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2 font-medium">Quando</th>
              <th className="pb-2 font-medium">Estado</th>
              <th className="pb-2 font-medium">Notícias</th>
              <th className="pb-2 font-medium">Tokens (in/out)</th>
              <th className="pb-2 font-medium">Custo</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 50).map((r) => {
              const output = r.output as RunOutput | null
              return (
                <Fragment key={r.id}>
                  <tr className="border-t border-slate-100">
                    <td className="py-2 pr-2 text-slate-600">
                      {new Date(r.started_at).toLocaleString('pt')}
                      {r.trigger === 'manual' && <span className="ml-1 text-xs text-slate-400">(manual)</span>}
                    </td>
                    <td className="py-2 pr-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          r.status === 'done' ? 'bg-green-100 text-green-800' : r.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {r.status === 'done' ? 'feita' : r.status === 'failed' ? 'falhou' : 'a correr'}
                      </span>
                    </td>
                    <td className="py-2 pr-2 tabular-nums">
                      {r.stories_inserted} novas{r.stories_found > r.stories_inserted ? ` / ${r.stories_found} propostas` : ''}
                    </td>
                    <td className="py-2 pr-2 tabular-nums text-slate-600">
                      {formatTokens(r.input_tokens)} / {formatTokens(r.output_tokens)}
                    </td>
                    <td className="py-2 pr-2 tabular-nums">{formatUsd(Number(r.cost_usd))}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => setOpen(open === r.id ? null : r.id)} className="text-xs text-blue-600 hover:underline">
                        {open === r.id ? 'fechar' : 'detalhes'}
                      </button>
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50 p-3 text-xs">
                        {r.error && <p className="mb-2 whitespace-pre-wrap break-words text-red-700">{r.error}</p>}
                        {(output?.accepted ?? []).map((s) => (
                          <div key={s.primary_url} className="mb-2 rounded border border-slate-200 bg-white p-2">
                            <p className="font-semibold text-slate-800">
                              {s.national && '🇲🇿 '}
                              {s.title}
                            </p>
                            <p>
                              <a href={s.primary_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                                {s.primary_source}
                              </a>
                              {s.corroborating.map((c) => (
                                <span key={c.url}>
                                  {' · '}
                                  <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline" title={c.confirms.join('; ')}>
                                    {c.source}
                                  </a>
                                </span>
                              ))}
                            </p>
                            {s.discrepancies.length > 0 && <p className="text-amber-700">Divergências: {s.discrepancies.join('; ')}</p>}
                          </div>
                        ))}
                        {(output?.rejected ?? []).length > 0 && (
                          <details>
                            <summary className="cursor-pointer text-slate-500">Rejeitadas pelo backend ({output!.rejected!.length})</summary>
                            <ul className="mt-1 list-disc pl-4 text-slate-500">
                              {output!.rejected!.map((x, i) => (
                                <li key={i}>{x}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {r.log_tail && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-slate-500">Registo do Hermes</summary>
                            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-600">{r.log_tail}</pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
}
