import { useSyncExternalStore } from 'react'

/**
 * Consentimento de cookies não essenciais (Analytics, AdSense) — só no site
 * público. Enquanto não houver decisão (ou se for "rejeitado"), nenhum
 * script de rastreio é sequer carregado (ver useAdSense/useAnalytics) — não
 * é só escondido, é omitido do DOM. Guardado em localStorage, por isso
 * sobrevive a visitas seguintes sem voltar a perguntar.
 *
 * Estado partilhado a sério (useSyncExternalStore), não um useState por
 * componente — PublicHeader (mostra o banner) e PublicFooter (link "Gerir
 * cookies") são irmãos, não pai/filho, e têm de reagir um ao outro.
 */

const CONSENT_KEY = 'ft-cookie-consent'
type ConsentValue = 'accepted' | 'rejected'

function readStored(): ConsentValue | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'accepted' || v === 'rejected' ? v : null
  } catch {
    return null
  }
}

let current: ConsentValue | null = readStored()
const listeners = new Set<() => void>()

function setStored(value: ConsentValue | null): void {
  current = value
  try {
    if (value === null) localStorage.removeItem(CONSENT_KEY)
    else localStorage.setItem(CONSENT_KEY, value)
  } catch {
    // localStorage indisponível — a decisão fica só em memória, dura a visita
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): ConsentValue | null {
  return current
}

/** No servidor (SSR) e durante a hidratação a decisão ainda é desconhecida —
 * `undefined`, não `null`, para o banner não aparecer no HTML do servidor e
 * depois desaparecer a quem já tinha aceitado. */
function getServerSnapshot(): undefined {
  return undefined
}

export function useConsent() {
  const status = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return {
    status,
    granted: status === 'accepted',
    accept: () => setStored('accepted'),
    reject: () => setStored('rejected'),
    /** Reabre o banner para mudar de ideias (link "Gerir cookies" no rodapé). */
    reset: () => setStored(null),
  }
}
