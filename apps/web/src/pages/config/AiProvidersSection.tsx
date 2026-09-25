import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Field, Loading, NumberInput, Section, Select, TextArea, TextInput } from './fields'
import { useSetting } from './useSetting'

/**
 * Provedores de IA e modelo por passo da cadeia (settings.ai_providers +
 * settings.model_by_step, lidos por apps/api/app/llm.py). As chaves de API vão
 * para o Supabase Vault via RPC `set_ai_provider_key` — este ecrã só as escreve
 * e só sabe se existem, nunca as lê de volta (guardrail #4).
 */

type Kind = 'anthropic' | 'openai_compatible'
type JsonMode = 'json_schema' | 'json_object' | 'prompt'
type TokenParam = 'max_tokens' | 'max_completion_tokens'

interface ModelEntry {
  id: string
  input_usd_per_mtok: number | null
  output_usd_per_mtok: number | null
}

interface Provider {
  id: string
  label: string
  kind: Kind
  base_url?: string
  use_env_credentials?: boolean
  headers?: Record<string, string>
  json_mode?: JsonMode
  token_param?: TokenParam
  /** modelos de raciocínio: quanto "pensam" antes de responder (só openai_compatible) */
  reasoning_effort?: string
  /** margem somada ao limite de tokens de cada chamada (para o raciocínio) */
  extra_tokens?: number
  models: ModelEntry[]
}

interface StepModel {
  provider: string
  model: string
}

interface AiProviders {
  default: StepModel
  providers: Provider[]
}

type ModelByStep = Record<string, StepModel | string>

const ENV_PROVIDER_ID = 'anthropic-env'

const DEFAULT_AI: AiProviders = {
  default: { provider: ENV_PROVIDER_ID, model: 'claude-haiku-4-5' },
  providers: [
    {
      id: ENV_PROVIDER_ID,
      label: 'Anthropic (proxy AWS, credenciais do .env)',
      kind: 'anthropic',
      use_env_credentials: true,
      models: [
        { id: 'claude-haiku-4-5', input_usd_per_mtok: 1, output_usd_per_mtok: 5 },
        { id: 'claude-sonnet-5', input_usd_per_mtok: 2, output_usd_per_mtok: 10 },
        { id: 'claude-opus-5', input_usd_per_mtok: 5, output_usd_per_mtok: 25 },
      ],
    },
  ],
}

export const PIPELINE_STEPS: { key: string; label: string }[] = [
  { key: 'extract_facts', label: '1. Ficha de factos (lê a fonte)' },
  { key: 'editorial_brief', label: '2. Plano editorial' },
  { key: 'write_article', label: '3. Escrita do artigo' },
  { key: 'self_audit', label: '4. Auditoria' },
  { key: 'rewrite_flagged', label: '5. Reescrita dirigida' },
  { key: 'package', label: '6. Título, SEO e tags' },
  { key: 'translate', label: 'Traduções (en/es/fr)' },
  { key: 'translate_audit', label: 'Auditoria das traduções' },
]

/** Pontos de partida para um provedor novo. Os modelos ficam em branco de
 * propósito: os nomes e preços mudam com frequência — copia-os da página do
 * provedor. */
const PRESETS: { key: string; label: string; provider: Omit<Provider, 'id' | 'models'> }[] = [
  { key: 'openai', label: 'OpenAI', provider: { label: 'OpenAI', kind: 'openai_compatible', base_url: 'https://api.openai.com/v1', token_param: 'max_completion_tokens' } },
  { key: 'anthropic', label: 'Anthropic (API direta)', provider: { label: 'Anthropic', kind: 'anthropic', base_url: 'https://api.anthropic.com' } },
  {
    key: 'gemini',
    label: 'Google Gemini',
    // os Gemini recentes raciocinam antes de responder e gastam o limite de
    // tokens nisso — 'low' deixa a resposta inteira (testado com gemini-3.8-flash)
    provider: { label: 'Google Gemini', kind: 'openai_compatible', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', reasoning_effort: 'low' },
  },
  { key: 'mistral', label: 'Mistral', provider: { label: 'Mistral', kind: 'openai_compatible', base_url: 'https://api.mistral.ai/v1' } },
  { key: 'deepseek', label: 'DeepSeek', provider: { label: 'DeepSeek', kind: 'openai_compatible', base_url: 'https://api.deepseek.com', json_mode: 'json_object' } },
  { key: 'groq', label: 'Groq', provider: { label: 'Groq', kind: 'openai_compatible', base_url: 'https://api.groq.com/openai/v1' } },
  { key: 'openrouter', label: 'OpenRouter', provider: { label: 'OpenRouter', kind: 'openai_compatible', base_url: 'https://openrouter.ai/api/v1' } },
  { key: 'custom', label: 'Outro (compatível com OpenAI)', provider: { label: 'Outro provedor', kind: 'openai_compatible', base_url: '' } },
]

function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'provedor'
  )
}

function asStepModel(value: StepModel | string | undefined, fallback: StepModel): StepModel {
  if (!value) return fallback
  if (typeof value === 'string') return { provider: fallback.provider, model: value }
  return { provider: value.provider || fallback.provider, model: value.model || fallback.model }
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

export default function AiProvidersSection() {
  const ai = useSetting<AiProviders>('ai_providers', DEFAULT_AI)
  const steps = useSetting<ModelByStep>('model_by_step', {})
  const keyStatus = useKeyStatus()
  const [preset, setPreset] = useState(PRESETS[0]!.key)

  const saveAll = useMutation({
    mutationFn: async () => {
      if (ai.draft && ai.dirty) await ai.save.mutateAsync(ai.draft)
      if (steps.draft && steps.dirty) await steps.save.mutateAsync(steps.draft)
    },
  })

  if (ai.isLoading || steps.isLoading || !ai.draft || !steps.draft) return <Loading what="provedores de IA" />
  const draft = ai.draft
  const providers = draft.providers
  const stepDraft = steps.draft

  const setProviders = (next: Provider[]) => ai.setDraft({ ...draft, providers: next })
  const updateProvider = (id: string, patch: Partial<Provider>) =>
    setProviders(providers.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const usage = (id: string) =>
    [draft.default.provider === id ? 'por omissão' : null, ...PIPELINE_STEPS.filter((s) => asStepModel(stepDraft[s.key], draft.default).provider === id).map((s) => s.label)].filter(
      (x): x is string => !!x,
    )

  function addProvider() {
    const chosen = PRESETS.find((p) => p.key === preset)!
    let id = slugify(chosen.provider.label)
    for (let i = 2; providers.some((p) => p.id === id); i++) id = `${slugify(chosen.provider.label)}-${i}`
    setProviders([...providers, { ...chosen.provider, id, models: [] }])
  }

  function removeProvider(id: string) {
    const used = usage(id)
    if (used.length > 0) {
      window.alert(`Este provedor ainda é usado em: ${used.join(', ')}. Muda esses passos primeiro.`)
      return
    }
    if (!window.confirm('Remover este provedor? A chave guardada no Vault também é apagada.')) return
    setProviders(providers.filter((p) => p.id !== id))
    void supabase.rpc('set_ai_provider_key', { p_provider_id: id, p_key: null }).then(() => keyStatus.refetch())
  }

  const problems = PIPELINE_STEPS.map((s) => ({ step: s, sm: asStepModel(stepDraft[s.key], draft.default) }))
    .filter(({ sm }) => !providers.some((p) => p.id === sm.provider) || !sm.model.trim())
    .map(({ step }) => step.label)
  if (!providers.some((p) => p.id === draft.default.provider)) problems.unshift('Provedor por omissão')
  const needsKey = providers.filter((p) => !p.use_env_credentials && !keyStatus.data?.[p.id] && usage(p.id).length > 0)

  const dirty = ai.dirty || steps.dirty

  return (
    <div className="space-y-8">
      <Section
        title="Provedores de IA"
        description={
          <>
            Qualquer API do tipo Anthropic ou compatível com OpenAI (OpenAI, Gemini, Mistral, DeepSeek, Groq, OpenRouter,
            Ollama…). As chaves ficam encriptadas no Supabase Vault; o painel nunca as mostra.
          </>
        }
      >
        <div className="space-y-4">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              hasKey={!!keyStatus.data?.[p.id]}
              keyUpdatedAt={keyStatus.data?.[p.id] ?? null}
              onChange={(patch) => updateProvider(p.id, patch)}
              onRemove={() => removeProvider(p.id)}
              onKeyChanged={() => void keyStatus.refetch()}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="w-60">
            <Select value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ value: p.key, label: p.label }))} />
          </div>
          <button onClick={addProvider} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            + Adicionar provedor
          </button>
        </div>
      </Section>

      <Section
        title="Modelo por passo"
        description="Cada passo da cadeia pode usar um provedor e modelo diferentes (ex.: um modelo barato para a ficha de factos, um melhor para a escrita)."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">Passo</th>
                <th className="pb-2 font-medium">Provedor</th>
                <th className="pb-2 font-medium">Modelo</th>
              </tr>
            </thead>
            <tbody>
              <StepRow
                label="Por omissão (passos sem escolha)"
                value={draft.default}
                providers={providers}
                onChange={(v) => ai.setDraft({ ...draft, default: v })}
              />
              {PIPELINE_STEPS.map((s) => (
                <StepRow
                  key={s.key}
                  label={s.label}
                  value={asStepModel(stepDraft[s.key], draft.default)}
                  providers={providers}
                  onChange={(v) => steps.setDraft({ ...stepDraft, [s.key]: v })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {problems.length > 0 && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          Sem provedor ou modelo válido: {problems.join(', ')}. O backend cai para o provedor por omissão nestes passos.
        </p>
      )}
      {needsKey.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Em uso mas sem chave: {needsKey.map((p) => p.label).join(', ')} — esses passos vão falhar até guardares a chave.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => saveAll.mutate()}
          disabled={!dirty || saveAll.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saveAll.isPending ? 'A guardar…' : 'Guardar provedores e modelos'}
        </button>
        {dirty && !saveAll.isPending && <span className="text-xs text-amber-600">Alterações por guardar</span>}
        {saveAll.isSuccess && !dirty && (
          <span className="text-xs text-green-600">Guardado. O backend aplica em até 30 s.</span>
        )}
        {saveAll.isError && <span className="text-xs text-red-600">Falhou: {saveAll.error.message}</span>}
      </div>
    </div>
  )
}

function StepRow({
  label,
  value,
  providers,
  onChange,
}: {
  label: string
  value: StepModel
  providers: Provider[]
  onChange: (v: StepModel) => void
}) {
  const provider = providers.find((p) => p.id === value.provider)
  const models = provider?.models.map((m) => m.id).filter(Boolean) ?? []
  return (
    <tr className="border-t border-slate-100">
      <td className="py-2 pr-3 text-slate-800">{label}</td>
      <td className="py-2 pr-2">
        <Select
          value={value.provider}
          onChange={(id) => {
            const next = providers.find((p) => p.id === id)
            onChange({ provider: id, model: next?.models[0]?.id ?? '' })
          }}
          options={[
            ...(provider ? [] : [{ value: value.provider, label: `${value.provider} (não existe)` }]),
            ...providers.map((p) => ({ value: p.id, label: p.label })),
          ]}
        />
      </td>
      <td className="py-2">
        {models.length > 0 ? (
          <Select
            value={value.model}
            onChange={(model) => onChange({ ...value, model })}
            options={[
              ...(models.includes(value.model) ? [] : [{ value: value.model, label: value.model || '— escolher —' }]),
              ...models.map((m) => ({ value: m, label: m })),
            ]}
          />
        ) : (
          <TextInput value={value.model} onChange={(model) => onChange({ ...value, model })} placeholder="id do modelo" />
        )}
      </td>
    </tr>
  )
}

function headersToText(headers: Record<string, string> | undefined): string {
  return Object.entries(headers ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
}

function textToHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

function ProviderCard({
  provider: p,
  hasKey,
  keyUpdatedAt,
  onChange,
  onRemove,
  onKeyChanged,
}: {
  provider: Provider
  hasKey: boolean
  keyUpdatedAt: string | null
  onChange: (patch: Partial<Provider>) => void
  onRemove: () => void
  onKeyChanged: () => void
}) {
  const [headersText, setHeadersText] = useState(headersToText(p.headers))
  const [key, setKey] = useState('')
  const queryClient = useQueryClient()
  const setKeyMutation = useMutation({
    mutationFn: async (value: string | null) => {
      const { error } = await supabase.rpc('set_ai_provider_key', { p_provider_id: p.id, p_key: value })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      setKey('')
      onKeyChanged()
      void queryClient.invalidateQueries({ queryKey: ['ai_provider_key_status'] })
    },
  })

  const [testing, setTesting] = useState<number | null>(null)
  const setModel = (i: number, patch: Partial<ModelEntry>) =>
    onChange({ models: p.models.map((m, j) => (j === i ? { ...m, ...patch } : m)) })

  return (
    <div className="rounded-md border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{p.label || p.id}</p>
          <p className="text-xs text-slate-400">id: {p.id}</p>
        </div>
        <button onClick={onRemove} className="text-xs text-red-600 hover:underline">
          Remover
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome">
          <TextInput value={p.label} onChange={(label) => onChange({ label })} />
        </Field>
        <Field label="Tipo de API">
          <Select
            value={p.kind}
            onChange={(kind) => onChange({ kind })}
            options={[
              { value: 'openai_compatible', label: 'Compatível com OpenAI (/chat/completions)' },
              { value: 'anthropic', label: 'Anthropic (/v1/messages)' },
            ]}
          />
        </Field>
        {p.use_env_credentials ? (
          <p className="text-xs text-slate-500 sm:col-span-2">
            Usa ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL / ANTHROPIC_WORKSPACE_ID do .env do backend — o provedor que já
            existia. Não precisa de chave aqui.
          </p>
        ) : (
          <>
            <Field label="URL base" hint={p.kind === 'anthropic' ? 'ex.: https://api.anthropic.com' : 'ex.: https://api.openai.com/v1'}>
              <TextInput type="url" value={p.base_url ?? ''} onChange={(base_url) => onChange({ base_url })} />
            </Field>
            <Field
              label="Chave de API"
              hint={
                hasKey
                  ? `Guardada no Vault${keyUpdatedAt ? ` (${new Date(keyUpdatedAt).toLocaleString('pt')})` : ''}. Escreve uma nova para substituir.`
                  : 'Ainda sem chave. Fica encriptada no Vault; o painel nunca a volta a mostrar.'
              }
            >
              <div className="flex gap-2">
                <TextInput type="password" value={key} onChange={setKey} placeholder={hasKey ? '•••••••• (guardada)' : 'sk-…'} />
                <button
                  onClick={() => setKeyMutation.mutate(key)}
                  disabled={!key.trim() || setKeyMutation.isPending}
                  className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {setKeyMutation.isPending ? '…' : 'Guardar chave'}
                </button>
                {hasKey && (
                  <button
                    onClick={() => window.confirm('Apagar a chave deste provedor?') && setKeyMutation.mutate(null)}
                    className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  >
                    Apagar
                  </button>
                )}
              </div>
              {setKeyMutation.isError && <span className="text-xs text-red-600">Falhou: {setKeyMutation.error.message}</span>}
            </Field>
          </>
        )}
        {p.kind === 'openai_compatible' && (
          <>
            <Field label="Como pedir JSON" hint="Se o provedor não suportar json_schema, o backend tenta json_object sozinho.">
              <Select
                value={p.json_mode ?? 'json_schema'}
                onChange={(json_mode) => onChange({ json_mode })}
                options={[
                  { value: 'json_schema', label: 'json_schema (estrito — recomendado)' },
                  { value: 'json_object', label: 'json_object + schema no prompt' },
                  { value: 'prompt', label: 'Só instrução no prompt' },
                ]}
              />
            </Field>
            <Field label="Parâmetro de limite de tokens" hint="Modelos OpenAI recentes pedem max_completion_tokens.">
              <Select
                value={p.token_param ?? 'max_tokens'}
                onChange={(token_param) => onChange({ token_param })}
                options={[
                  { value: 'max_tokens', label: 'max_tokens' },
                  { value: 'max_completion_tokens', label: 'max_completion_tokens' },
                ]}
              />
            </Field>
            <Field
              label="Raciocínio (reasoning_effort)"
              hint="Modelos que “pensam” antes de responder gastam o limite de tokens nisso e a resposta sai cortada. Cada modelo aceita valores diferentes — usa “Testar”."
            >
              <Select
                value={p.reasoning_effort ?? ''}
                onChange={(v) => onChange({ reasoning_effort: v || undefined })}
                options={[
                  { value: '', label: 'Não enviar (padrão do modelo)' },
                  { value: 'none', label: 'none — sem raciocínio' },
                  { value: 'low', label: 'low' },
                  { value: 'medium', label: 'medium' },
                  { value: 'high', label: 'high' },
                ]}
              />
            </Field>
          </>
        )}
        <Field label="Tokens extra por chamada" hint="Margem somada ao limite de cada passo. Sobe isto se o teste disser “resposta cortada”.">
          <NumberInput value={p.extra_tokens ?? 0} step={256} onChange={(v) => onChange({ extra_tokens: Math.max(0, Math.round(v)) })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Cabeçalhos extra (não secretos)" hint="Um por linha, “Nome: valor”. Segredos vão sempre na chave, nunca aqui.">
            <TextArea
              value={headersText}
              rows={2}
              onChange={(text) => {
                setHeadersText(text)
                onChange({ headers: textToHeaders(text) })
              }}
            />
          </Field>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-sm font-medium text-slate-700">Modelos</p>
        <p className="mb-2 text-xs text-slate-400">
          O id exato que a API espera. O preço (USD por milhão de tokens) só serve para a aba “Gastos IA”.
        </p>
        <div className="space-y-2">
          {p.models.map((m, i) => (
            <div key={i}>
              <div className="grid grid-cols-[1fr_6rem_6rem_auto_auto] items-center gap-2">
                <TextInput value={m.id} onChange={(id) => setModel(i, { id: id.trim() })} placeholder="ex.: gpt-…" />
                <NumberInput value={m.input_usd_per_mtok ?? 0} step={0.01} onChange={(v) => setModel(i, { input_usd_per_mtok: v })} />
                <NumberInput value={m.output_usd_per_mtok ?? 0} step={0.01} onChange={(v) => setModel(i, { output_usd_per_mtok: v })} />
                <button
                  onClick={() => setTesting(testing === i ? null : i)}
                  disabled={!m.id}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
                >
                  {testing === i ? 'Fechar' : 'Testar'}
                </button>
                <button
                  onClick={() => onChange({ models: p.models.filter((_, j) => j !== i) })}
                  className="text-xs text-slate-400 hover:text-red-600"
                  aria-label="Remover modelo"
                >
                  ✕
                </button>
              </div>
              {testing === i && m.id && (
                <ModelTest provider={p} model={m.id} needsKey={!p.use_env_credentials && !hasKey} />
              )}
            </div>
          ))}
          {p.models.length > 0 && (
            <div className="grid grid-cols-[1fr_6rem_6rem_auto_auto] gap-2 text-[11px] text-slate-400">
              <span>id</span>
              <span>entrada $/M</span>
              <span>saída $/M</span>
              <span />
              <span />
            </div>
          )}
        </div>
        <button
          onClick={() => onChange({ models: [...p.models, { id: '', input_usd_per_mtok: null, output_usd_per_mtok: null }] })}
          className="mt-2 text-xs font-medium text-slate-600 underline"
        >
          + Adicionar modelo
        </button>
      </div>
    </div>
  )
}

interface TestCall {
  ok: boolean
  text?: string
  parsed?: Record<string, unknown>
  error?: string
  seconds?: number
  input_tokens?: number
  output_tokens?: number
  cost_usd?: number
}

interface TestResult {
  ok: boolean
  answer?: TestCall
  structured?: TestCall
  error?: string
}

/**
 * Teste real de um modelo com a configuração tal como está no ecrã (ainda que
 * não gravada) e a chave já guardada no Vault. Duas chamadas: a pergunta em
 * texto livre, e um pequeno pedido em JSON — é JSON que toda a cadeia editorial
 * pede, e é aí que um modelo "funciona" no chat mas falha nos artigos.
 * Corre na API (POST /api/admin/ai/test → apps/api/app/routers/admin.py).
 */
function ModelTest({ provider, model, needsKey }: { provider: Provider; model: string; needsKey: boolean }) {
  const [question, setQuestion] = useState('Quem ganhou o Mundial de 2022? Responde numa frase.')
  const run = useMutation({
    mutationFn: async (): Promise<TestResult> => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('sessão expirada — volta a entrar no painel')
      const response = await fetch('/api/admin/ai/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider, model, question }),
      })
      const body = (await response.json().catch(() => ({}))) as TestResult & { detail?: unknown }
      if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${response.status}`)
      return body
    },
  })

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
      {needsKey && (
        <p className="mb-2 text-xs text-amber-700">Guarda primeiro a chave de API deste provedor — o teste usa a chave do Vault.</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <TextInput value={question} onChange={setQuestion} />
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending || !question.trim() || needsKey}
          className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {run.isPending ? 'A testar… (até ~1 min)' : `Testar ${model}`}
        </button>
      </div>
      {run.isError && <p className="mt-2 text-xs text-red-600">Não foi possível testar: {run.error.message}</p>}
      {run.data && (
        <div className="mt-3 space-y-2">
          <p className={`text-xs font-semibold ${run.data.ok ? 'text-green-700' : 'text-red-700'}`}>
            {run.data.ok ? '✅ Pronto a usar nos artigos' : '❌ Ainda não está pronto para os artigos'}
          </p>
          {run.data.error && <p className="text-xs text-red-600">{run.data.error}</p>}
          <TestCallView title="1. Resposta à pergunta" call={run.data.answer} />
          <TestCallView title="2. Resposta em JSON (o que a cadeia editorial usa)" call={run.data.structured} />
        </div>
      )}
    </div>
  )
}

function TestCallView({ title, call }: { title: string; call?: TestCall }) {
  if (!call) return null
  return (
    <div className="rounded border border-slate-200 bg-white p-2 text-xs">
      <p className="font-medium text-slate-700">
        {call.ok ? '✅' : '❌'} {title}
        <span className="ml-2 font-normal text-slate-400">
          {call.seconds ?? '?'} s · {call.input_tokens ?? 0}/{call.output_tokens ?? 0} tokens
          {call.cost_usd ? ` · $${call.cost_usd.toFixed(5)}` : ''}
        </span>
      </p>
      {call.text && <p className="mt-1 whitespace-pre-wrap text-slate-800">{call.text}</p>}
      {call.error && <p className="mt-1 whitespace-pre-wrap break-words text-red-600">{call.error}</p>}
    </div>
  )
}
