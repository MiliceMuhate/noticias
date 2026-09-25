import { Field, LinesInput, Loading, SaveBar, Section, Select, TextArea, TextInput, Toggle } from './fields'
import { useSetting } from './useSetting'

/** Voz editorial, assinatura/editorias e tags — o que o redator (IA) usa para escrever.
 * Valores por omissão espelham apps/api/app/services/articles.py (DEFAULT_*). */

export default function VoiceSection() {
  return (
    <div className="space-y-8">
      <AuthorsSection />
      <VoiceStyleSection />
      <TagsSection />
    </div>
  )
}

interface Desk {
  beat: string
  voice: string
}
interface Authors {
  byline: string
  editor: string
  ai_assisted: boolean
  desks: Record<string, Desk>
}

const DESK_LABELS: Record<string, string> = {
  resultados: 'Resultados (jogos, competições)',
  transferencias: 'Transferências',
  analise: 'Análise (lesões, declarações, outros)',
  institucional: 'Institucional',
}

const DEFAULT_AUTHORS: Authors = {
  byline: 'Redação footballtrend',
  editor: '',
  ai_assisted: true,
  desks: {
    resultados: { beat: 'Jogos e classificações', voice: 'rápida, factual, cronológica. Frases curtas. O resultado no lead, sempre.' },
    transferencias: {
      beat: 'Mercado',
      voice: 'cautelosa e explícita sobre o grau de confirmação — distingue sempre acordado, em negociação e noticiado por.',
    },
    analise: { beat: 'Contexto e leitura', voice: 'mais pausada, com parágrafos ligeiramente maiores, argumenta a partir dos factos da ficha.' },
    institucional: { beat: 'Clubes, federações, regulamentos', voice: 'sóbria, quase administrativa. Cita documentos e comunicados pelo nome.' },
  },
}

function AuthorsSection() {
  const { draft, setDraft, save, dirty, isLoading } = useSetting('authors', DEFAULT_AUTHORS)
  if (isLoading || !draft) return <Loading what="autoria" />
  const desks = { ...DEFAULT_AUTHORS.desks, ...draft.desks }

  return (
    <Section title="Assinatura e editorias" description="Aparece em cada artigo (e nos dados estruturados para o Google).">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Assinatura" hint="Nome da redação, não de uma pessoa.">
          <TextInput value={draft.byline} onChange={(v) => setDraft({ ...draft, byline: v })} />
        </Field>
        <Field label="Editor responsável" hint="A pessoa real que responde pelo conteúdo.">
          <TextInput value={draft.editor} onChange={(v) => setDraft({ ...draft, editor: v })} />
        </Field>
      </div>
      <div className="mt-4">
        <Toggle
          checked={draft.ai_assisted}
          onChange={(v) => setDraft({ ...draft, ai_assisted: v })}
          label="Indicar que o artigo foi escrito com assistência de IA"
        />
      </div>
      <div className="mt-6 space-y-4">
        {Object.keys(DESK_LABELS).map((desk) => {
          const value = desks[desk] ?? { beat: '', voice: '' }
          const setDesk = (patch: Partial<Desk>) =>
            setDraft({ ...draft, desks: { ...desks, [desk]: { ...value, ...patch } } })
          return (
            <div key={desk} className="rounded-md border border-slate-100 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-800">{DESK_LABELS[desk]}</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                <Field label="Área">
                  <TextInput value={value.beat} onChange={(v) => setDesk({ beat: v })} />
                </Field>
                <Field label="Voz" hint="Instrução de estilo para o redator.">
                  <TextArea value={value.voice} rows={2} onChange={(v) => setDesk({ voice: v })} />
                </Field>
              </div>
            </div>
          )
        })}
      </div>
      <SaveBar dirty={dirty} save={save} value={draft} />
    </Section>
  )
}

interface EditorialVoice {
  variant: string
  cliche_blacklist: string[]
}

const DEFAULT_VOICE: EditorialVoice = { variant: 'pt-PT', cliche_blacklist: [] }

function VoiceStyleSection() {
  const { draft, setDraft, save, dirty, isLoading } = useSetting('editorial_voice', DEFAULT_VOICE)
  if (isLoading || !draft) return <Loading what="voz editorial" />

  return (
    <Section title="Estilo" description="Como a redação escreve em português. As traduções seguem o artigo pt.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Variante do português">
          <Select
            value={draft.variant === 'pt-BR' ? 'pt-BR' : 'pt-PT'}
            onChange={(v) => setDraft({ ...draft, variant: v })}
            options={[
              { value: 'pt-PT', label: 'Português europeu (pt-PT)' },
              { value: 'pt-BR', label: 'Português do Brasil (pt-BR)' },
            ]}
          />
        </Field>
        <Field label="Expressões proibidas" hint="Uma por linha. O redator nunca as usa.">
          <LinesInput value={draft.cliche_blacklist} onChange={(v) => setDraft({ ...draft, cliche_blacklist: v })} rows={8} />
        </Field>
      </div>
      <SaveBar dirty={dirty} save={save} value={draft} />
    </Section>
  )
}

function TagsSection() {
  const { draft, setDraft, save, dirty, isLoading } = useSetting<string[]>('controlled_tags', [])
  if (isLoading || !draft) return <Loading what="tags" />

  return (
    <Section title="Tags permitidas" description="Vocabulário fechado: o gerador nunca inventa tags fora desta lista.">
      <LinesInput value={draft} onChange={setDraft} rows={8} />
      <SaveBar dirty={dirty} save={save} value={draft} />
    </Section>
  )
}
