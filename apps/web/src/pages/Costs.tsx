import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Job } from '@repo/shared'
import { supabase } from '../lib/supabase'

/**
 * Gastos IA — custo estimado das gerações de artigo (ver docs/DATA_MODEL.md,
 * jobs.input_tokens/output_tokens/cost_usd). Estimativa com base nos preços
 * públicos da API Anthropic (apps/api/app/pricing.py) — a chave real corre por
 * um proxy AWS empresarial, cujo tarifário pode divergir.
 */

async function fetchJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('type', 'generate-article')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return data
}

function formatUsd(value: number): string {
  if (value === 0) return '$0.00'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function jobTerm(job: Job): string {
  const payload = job.payload as { term?: string } | null
  return payload?.term ?? '—'
}

/** arredonda para um "número bonito" para os ticks do eixo Y (1/2/5 × 10^n) */
function niceMax(value: number): number {
  if (value <= 0) return 0.01
  const exponent = Math.floor(Math.log10(value))
  const fraction = value / 10 ** exponent
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * 10 ** exponent
}

interface DayTotal {
  date: string
  label: string
  costUsd: number
}

function DailySpendChart({ days }: { days: DayTotal[] }) {
  const [hovered, setHovered] = useState<number | null>(null)

  const width = 720
  const height = 220
  const paddingLeft = 56
  const paddingBottom = 28
  const paddingTop = 12
  const plotWidth = width - paddingLeft - 8
  const plotHeight = height - paddingTop - paddingBottom

  const max = niceMax(Math.max(...days.map((d) => d.costUsd), 0.0001))
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max]

  const barGap = 2
  const barSlot = plotWidth / days.length
  const barWidth = Math.min(24, barSlot - barGap)

  const y = (v: number) => paddingTop + plotHeight - (v / max) * plotHeight

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Gastos diários com IA, em dólares">
        {/* gridlines + ticks do eixo Y */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={paddingLeft}
              x2={width}
              y1={y(t)}
              y2={y(t)}
              className="stroke-slate-200"
              strokeWidth={1}
            />
            <text x={paddingLeft - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[10px]">
              {formatUsd(t)}
            </text>
          </g>
        ))}

        {/* barras */}
        {days.map((d, i) => {
          const barHeight = Math.max(0, (d.costUsd / max) * plotHeight)
          const x = paddingLeft + i * barSlot + (barSlot - barWidth) / 2
          const barY = paddingTop + plotHeight - barHeight
          const isHovered = hovered === i
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={barY}
                width={barWidth}
                height={Math.max(barHeight, 1)}
                rx={4}
                className={isHovered ? 'fill-pitch-500' : 'fill-pitch-600'}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((v) => (v === i ? null : v))}
              />
              {/* alvo de hover maior que a barra, para facilitar o rato */}
              <rect
                x={paddingLeft + i * barSlot}
                y={paddingTop}
                width={barSlot}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((v) => (v === i ? null : v))}
              />
              {i % Math.ceil(days.length / 8 || 1) === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={height - paddingBottom + 14}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px]"
                >
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hovered !== null && days[hovered] && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg">
          {days[hovered].label}: <span className="font-semibold">{formatUsd(days[hovered].costUsd)}</span>
        </div>
      )}
    </div>
  )
}

export default function Costs() {
  const { data: jobs, isLoading, error } = useQuery({ queryKey: ['jobs', 'generate-article'], queryFn: fetchJobs })

  const { totalCost, totalInputTokens, totalOutputTokens, totalRuns, avgCost, dayTotals } = useMemo(() => {
    const rows = jobs ?? []
    const totalCost = rows.reduce((sum, j) => sum + Number(j.cost_usd), 0)
    const totalInputTokens = rows.reduce((sum, j) => sum + j.input_tokens, 0)
    const totalOutputTokens = rows.reduce((sum, j) => sum + j.output_tokens, 0)
    const totalRuns = rows.length

    // últimos 14 dias, mais recente à direita
    const byDay = new Map<string, number>()
    for (const j of rows) {
      const day = j.created_at.slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + Number(j.cost_usd))
    }
    const dayTotals: DayTotal[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      dayTotals.push({
        date: key,
        label: d.toLocaleDateString('pt', { day: 'numeric', month: 'short' }),
        costUsd: byDay.get(key) ?? 0,
      })
    }

    return {
      totalCost,
      totalInputTokens,
      totalOutputTokens,
      totalRuns,
      avgCost: totalRuns > 0 ? totalCost / totalRuns : 0,
      dayTotals,
    }
  }, [jobs])

  if (isLoading) return <p className="text-slate-500">A carregar gastos…</p>
  if (error) return <p className="text-red-600">Erro: {(error as Error).message}</p>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Gasto total (14 dias)" value={formatUsd(totalCost)} />
        <StatTile label="Gerações" value={String(totalRuns)} />
        <StatTile label="Custo médio / geração" value={formatUsd(avgCost)} />
        <StatTile label="Tokens (in / out)" value={`${formatTokens(totalInputTokens)} / ${formatTokens(totalOutputTokens)}`} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Gastos diários</h2>
        <p className="mb-4 text-xs text-slate-400">
          Estimativa com base nos preços públicos da API Anthropic — a chave real corre por um
          proxy AWS empresarial, que pode ter tarifário diferente.
        </p>
        <DailySpendChart days={dayTotals} />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Gerações recentes</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Artigo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Tokens (in/out)</th>
                <th className="px-4 py-3">Custo</th>
                <th className="px-4 py-3">Quando</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).slice(0, 50).map((job) => (
                <tr key={job.id} className="border-b border-slate-100 last:border-0">
                  <td className="max-w-xs truncate px-4 py-2 font-medium text-slate-800">{jobTerm(job)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        job.status === 'done'
                          ? 'bg-green-100 text-green-800'
                          : job.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-slate-600">
                    {formatTokens(job.input_tokens)} / {formatTokens(job.output_tokens)}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-slate-800">{formatUsd(Number(job.cost_usd))}</td>
                  <td className="px-4 py-2 text-slate-500">{new Date(job.created_at).toLocaleString('pt')}</td>
                </tr>
              ))}
              {(jobs ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Ainda sem gerações registadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  )
}
