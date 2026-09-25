import { useQuery } from '@tanstack/react-query'
import type { ContentTranslation } from '@repo/shared'
import { supabase } from '../../lib/supabase'
import { Field, Loading, NumberInput, SaveBar, Section, Toggle } from './fields'
import { useSetting } from './useSetting'

/** settings.translation — o backend (services/translate.py) traduz cada artigo
 * publicado para estas línguas, a cada ~2 min. */

const LANGS = [
  { code: 'en', label: 'Inglês' },
  { code: 'es', label: 'Espanhol' },
  { code: 'fr', label: 'Francês' },
] as const

interface TranslationSettings {
  enabled: boolean
  languages: string[]
  max_attempts: number
}

const DEFAULT_TRANSLATION: TranslationSettings = { enabled: true, languages: ['en', 'es', 'fr'], max_attempts: 3 }

type Row = Pick<ContentTranslation, 'id' | 'lang' | 'status' | 'title' | 'error' | 'attempts' | 'updated_at' | 'content_item_id'>

export default function TranslationSection() {
  const { draft, setDraft, save, dirty, isLoading } = useSetting('translation', DEFAULT_TRANSLATION)
  const { data: rows } = useQuery({
    queryKey: ['content_translations', 'status'],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('content_translations')
        .select('id, lang, status, title, error, attempts, updated_at, content_item_id')
        .order('updated_at', { ascending: false })
        .limit(500)
      if (error) throw new Error(error.message)
      return data
    },
    refetchInterval: 30_000,
  })

  if (isLoading || !draft) return <Loading what="traduções" />

  const counts = (lang: string) => {
    const mine = (rows ?? []).filter((r) => r.lang === lang)
    return {
      ready: mine.filter((r) => r.status === 'ready').length,
      blocked: mine.filter((r) => r.status === 'blocked').length,
      failed: mine.filter((r) => r.status === 'failed').length,
    }
  }
  const problems = (rows ?? []).filter((r) => r.status !== 'ready').slice(0, 10)

  return (
    <div className="space-y-8">
      <Section
        title="Traduções do site"
        description="Cada artigo, depois de publicado em português, é traduzido para estas línguas e aparece em /en/, /es/, /fr/. Se editares o artigo pt, as traduções refazem-se sozinhas."
      >
        <div className="space-y-4">
          <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} label="Traduzir artigos publicados" />
          <div className="flex flex-wrap gap-4">
            {LANGS.map((l) => (
              <Toggle
                key={l.code}
                checked={draft.languages.includes(l.code)}
                onChange={(on) =>
                  setDraft({
                    ...draft,
                    languages: on ? [...draft.languages, l.code] : draft.languages.filter((c) => c !== l.code),
                  })
                }
                label={l.label}
              />
            ))}
          </div>
          <div className="max-w-xs">
            <Field label="Tentativas por tradução" hint="Depois disto, uma tradução falhada ou bloqueada fica parada até o artigo pt mudar.">
              <NumberInput value={draft.max_attempts} min={1} max={10} onChange={(max_attempts) => setDraft({ ...draft, max_attempts })} />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Cada tradução passa pelo portão de originalidade contra o texto da fonte: a fonte costuma estar em inglês, e
            traduzir de volta pode reaproximar o texto do original. Se ficar próxima demais, não é publicada
            (“bloqueada”). O modelo usado define-se em Provedores de IA → “Traduções”.
          </p>
        </div>
        <SaveBar dirty={dirty} save={save} value={draft} />
      </Section>

      <Section title="Estado">
        <div className="grid gap-3 sm:grid-cols-3">
          {LANGS.map((l) => {
            const c = counts(l.code)
            return (
              <div key={l.code} className="rounded-md border border-slate-100 p-3 text-sm">
                <p className="font-semibold text-slate-800">{l.label}</p>
                <p className="text-green-700">{c.ready} publicadas</p>
                {c.blocked > 0 && <p className="text-amber-700">{c.blocked} bloqueadas (próximas da fonte)</p>}
                {c.failed > 0 && <p className="text-red-700">{c.failed} com erro</p>}
              </div>
            )
          })}
        </div>
        {problems.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-slate-500">Últimas por resolver</p>
            {problems.map((r) => (
              <div key={r.id} className="rounded-md bg-slate-50 px-3 py-2 text-xs">
                <span className="font-semibold uppercase">{r.lang}</span> · {r.status === 'blocked' ? 'bloqueada' : 'erro'} ·{' '}
                tentativa {r.attempts} · <span className="text-slate-700">{r.title ?? r.content_item_id}</span>
                {r.error && <p className="mt-1 break-words text-slate-500">{r.error}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
