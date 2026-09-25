import type { ReactNode } from 'react'
import type { UseMutationResult } from '@tanstack/react-query'

/** Peças de formulário partilhadas pelas secções de Configuração. */

export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-base font-semibold text-slate-900">{title}</h2>
      {description && <div className="mb-3 text-sm text-slate-500">{description}</div>}
      <div className="rounded-lg border border-slate-200 bg-white p-4">{children}</div>
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm'

export function NumberInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const n = Number(e.target.value)
        onChange(Number.isFinite(n) ? n : 0)
      }}
      className={inputClass}
    />
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'password' | 'url'
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
      autoComplete="off"
    />
  )
}

export function TextArea({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return <textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} className={inputClass} />
}

/** Lista de strings editada como uma por linha. */
export function LinesInput({ value, onChange, rows = 6 }: { value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  return (
    <textarea
      value={value.join('\n')}
      rows={rows}
      onChange={(e) =>
        onChange(
          e.target.value
            .split('\n')
            .map((l) => l.trimStart())
            .filter((l, i, all) => l !== '' || i === all.length - 1),
        )
      }
      onBlur={() => onChange(value.map((l) => l.trim()).filter(Boolean))}
      className={`${inputClass} font-mono text-xs`}
    />
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputClass}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>{label}</span>
    </label>
  )
}

export function SaveBar<T>({
  dirty,
  save,
  value,
}: {
  dirty: boolean
  save: UseMutationResult<void, Error, T>
  value: T | null
}) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        onClick={() => value && save.mutate(value)}
        disabled={!dirty || save.isPending || !value}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {save.isPending ? 'A guardar…' : 'Guardar'}
      </button>
      {dirty && !save.isPending && <span className="text-xs text-amber-600">Alterações por guardar</span>}
      {save.isSuccess && !dirty && <span className="text-xs text-green-600">Guardado.</span>}
      {save.isError && <span className="text-xs text-red-600">Falhou: {save.error.message}</span>}
    </div>
  )
}

export function Loading({ what }: { what: string }) {
  return <p className="text-sm text-slate-500">A carregar {what}…</p>
}
