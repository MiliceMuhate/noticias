import { Field, Loading, NumberInput, SaveBar, Section, Select, Toggle } from './fields'
import { useSetting } from './useSetting'

/**
 * Comportamento da IA em relação à publicação: o que o piloto automático pode
 * publicar sozinho (settings.autopilot_policy), como a cadeia editorial reage
 * à auditoria (editorial_pipeline), os limiares do portão de originalidade e
 * da pontuação de tendências. Tudo lido pelo backend a cada ciclo — muda sem
 * deploy. Os valores por omissão espelham a migração 20260925000001 / seed.sql.
 */

export default function EditorialSection() {
  return (
    <div className="space-y-8">
      <AutopilotPolicySection />
      <PipelineSection />
      <OriginalitySection />
      <ScoringSection />
    </div>
  )
}

// --- piloto automático -------------------------------------------------------

interface AutopilotPolicy {
  min_originality: 'pass' | 'review'
  min_audit: 'aprovado' | 'rever'
}

const DEFAULT_POLICY: AutopilotPolicy = { min_originality: 'pass', min_audit: 'aprovado' }

function AutopilotPolicySection() {
  const { draft, setDraft, save, dirty, isLoading } = useSetting('autopilot_policy', DEFAULT_POLICY)
  if (isLoading || !draft) return <Loading what="política do piloto" />
  const loosened = draft.min_originality !== 'pass' || draft.min_audit !== 'aprovado'

  return (
    <Section
      title="O que o piloto automático publica sozinho"
      description="Só se aplica com o piloto ligado. O que não cumprir fica em “Por rever” para um humano. Bloqueados nunca são publicados, em nenhum nível."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Portão de originalidade (determinístico)" hint="Compara palavra a palavra com o texto da fonte.">
          <Select
            value={draft.min_originality}
            onChange={(v) => setDraft({ ...draft, min_originality: v })}
            options={[
              { value: 'pass', label: 'Só “Original” (pass) — recomendado' },
              { value: 'review', label: 'Também “Verificar” (review)' },
            ]}
          />
        </Field>
        <Field label="Auditoria (IA)" hint="Compara o sentido com o original: tradução à letra, factos inventados, estrutura decalcada.">
          <Select
            value={draft.min_audit}
            onChange={(v) => setDraft({ ...draft, min_audit: v })}
            options={[
              { value: 'aprovado', label: 'Só “aprovado” — recomendado' },
              { value: 'rever', label: 'Também “rever”' },
            ]}
          />
        </Field>
      </div>
      {loosened && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ Com isto, o piloto publica sem ninguém ver artigos que a verificação marcou como tendo problemas
          (frases traduzidas à letra, citações por traduzir, afirmações que não estão na fonte). É o tipo de conteúdo
          que o Google penaliza. Ative “Reescrever quando a auditoria diz rever” abaixo para reduzir estes casos.
        </p>
      )}
      <SaveBar dirty={dirty} save={save} value={draft} />
    </Section>
  )
}

// --- cadeia editorial ----------------------------------------------------------

interface Pipeline {
  rewrite_on_audit_review: boolean
  audit_strictness: 'tolerante' | 'normal' | 'rigoroso'
}

const DEFAULT_PIPELINE: Pipeline = { rewrite_on_audit_review: true, audit_strictness: 'normal' }

function PipelineSection() {
  const { draft, setDraft, save, dirty, isLoading } = useSetting('editorial_pipeline', DEFAULT_PIPELINE)
  if (isLoading || !draft) return <Loading what="cadeia editorial" />

  return (
    <Section title="Cadeia editorial" description="Como a geração reage ao que a auditoria encontra. Vale para artigos gerados daqui em diante.">
      <div className="space-y-4">
        <Field
          label="Rigor da auditoria"
          hint="Muda a fronteira entre “aprovado” e “rever”. “Bloquear” é sempre cópia ou invenção grave, em qualquer nível."
        >
          <Select
            value={draft.audit_strictness}
            onChange={(v) => setDraft({ ...draft, audit_strictness: v })}
            options={[
              { value: 'tolerante', label: 'Tolerante — só “rever” com 3+ casos ou um facto errado' },
              { value: 'normal', label: 'Normal — critérios do prompt tal como estão' },
              { value: 'rigoroso', label: 'Rigoroso — qualquer caso, por menor que seja, dá “rever”' },
            ]}
          />
        </Field>
        <Toggle
          checked={draft.rewrite_on_audit_review}
          onChange={(v) => setDraft({ ...draft, rewrite_on_audit_review: v })}
          label={
            <>
              <strong>Reescrever quando a auditoria diz “rever”</strong> — corrige os trechos assinalados e audita de novo
              (cerca de 2 chamadas de IA a mais por artigo). Desligado, só se reescreve com “bloquear”.
            </>
          }
        />
      </div>
      <SaveBar dirty={dirty} save={save} value={draft} />
    </Section>
  )
}

// --- limiares de originalidade -----------------------------------------------------

type Threshold = { pass: number; block: number }
type Thresholds = Record<string, Threshold>

const DEFAULT_THRESHOLDS: Thresholds = {
  longest_common_run: { pass: 7, block: 11 },
  containment_5: { pass: 0.04, block: 0.09 },
  jaccard_5: { pass: 0.06, block: 0.12 },
  sentence_overlap: { pass: 0.1, block: 0.2 },
  title_overlap: { pass: 0.5, block: 0.65 },
  self_similarity: { pass: 0.06, block: 0.12 },
  word_count: { pass: 600, block: 500 },
}

const THRESHOLD_LABELS: Record<string, { label: string; hint: string; step: number }> = {
  longest_common_run: { label: 'Maior sequência de palavras iguais (LCR)', hint: 'em palavras', step: 1 },
  containment_5: { label: 'Fração do artigo presente na fonte', hint: '0–1, blocos de 5 palavras', step: 0.01 },
  jaccard_5: { label: 'Semelhança global (Jaccard)', hint: '0–1', step: 0.01 },
  sentence_overlap: { label: 'Frases com trechos da fonte', hint: '0–1, fração das frases', step: 0.01 },
  title_overlap: { label: 'Título parecido com o da fonte', hint: '0–1', step: 0.01 },
  self_similarity: { label: 'Parecido com artigos nossos (72h)', hint: '0–1', step: 0.01 },
  word_count: { label: 'Comprimento mínimo', hint: 'em palavras — aqui, abaixo de “bloquear” bloqueia', step: 10 },
}

function OriginalitySection() {
  const { draft, setDraft, save, dirty, isLoading } = useSetting('originality_thresholds', DEFAULT_THRESHOLDS)
  if (isLoading || !draft) return <Loading what="limiares de originalidade" />

  const set = (key: string, field: keyof Threshold, value: number) =>
    setDraft({ ...draft, [key]: { ...(draft[key] ?? DEFAULT_THRESHOLDS[key]!), [field]: value } })

  return (
    <Section
      title="Portão de originalidade"
      description="Até “Original” passa; entre os dois valores fica “Verificar”; acima de “Bloquear” não é publicado (e tenta-se reescrever). Também se aplica às traduções."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2 font-medium">Medida</th>
              <th className="w-28 pb-2 font-medium">Original até</th>
              <th className="w-28 pb-2 font-medium">Bloquear acima de</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(DEFAULT_THRESHOLDS).map((key) => {
              const meta = THRESHOLD_LABELS[key]!
              const value = draft[key] ?? DEFAULT_THRESHOLDS[key]!
              return (
                <tr key={key} className="border-t border-slate-100">
                  <td className="py-2 pr-3">
                    <span className="text-slate-800">{meta.label}</span>
                    <span className="block text-xs text-slate-400">{meta.hint}</span>
                  </td>
                  <td className="py-2 pr-2">
                    <NumberInput value={value.pass} step={meta.step} onChange={(v) => set(key, 'pass', v)} />
                  </td>
                  <td className="py-2">
                    <NumberInput value={value.block} step={meta.step} onChange={(v) => set(key, 'block', v)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SaveBar dirty={dirty} save={save} value={draft} />
        <button
          type="button"
          onClick={() => setDraft({ ...draft, ...DEFAULT_THRESHOLDS })}
          className="mt-4 text-xs text-slate-500 underline"
        >
          Repor valores calibrados
        </button>
      </div>
    </Section>
  )
}

// --- pontuação de tendências -------------------------------------------------------

interface ScoreThreshold {
  min_score: number
}
interface AutoApproveGen {
  enabled: boolean
  auto_threshold: number
}

function ScoringSection() {
  const threshold = useSetting<ScoreThreshold>('score_threshold', { min_score: 0.45 })
  const auto = useSetting<AutoApproveGen>('auto_approve_gen', { enabled: false, auto_threshold: 1 })
  if (threshold.isLoading || auto.isLoading || !threshold.draft || !auto.draft) return <Loading what="pontuação" />
  const t = threshold.draft
  const a = auto.draft

  return (
    <Section title="Pontuação de notícias detetadas" description="Decide que notícias dos feeds chegam a ser escritas.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Field label="Pontuação mínima para ficar" hint="0–1. Abaixo disto a notícia é descartada.">
            <NumberInput value={t.min_score} step={0.05} max={1} onChange={(v) => threshold.setDraft({ ...t, min_score: v })} />
          </Field>
          <SaveBar dirty={threshold.dirty} save={threshold.save} value={threshold.draft} />
        </div>
        <div className="space-y-3">
          <Toggle
            checked={a.enabled}
            onChange={(v) => auto.setDraft({ ...a, enabled: v })}
            label="Gerar automaticamente as notícias com pontuação alta"
          />
          <Field label="A partir de" hint="0–1. Abaixo disto (mas acima do mínimo) espera por um clique em Tendências.">
            <NumberInput value={a.auto_threshold} step={0.05} max={1} onChange={(v) => auto.setDraft({ ...a, auto_threshold: v })} />
          </Field>
          <SaveBar dirty={auto.dirty} save={auto.save} value={auto.draft} />
        </div>
      </div>
    </Section>
  )
}
