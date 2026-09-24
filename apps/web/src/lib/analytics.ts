import { useEffect } from 'react'

/**
 * Google Analytics (Firebase/GA4) — só no site público, nunca no painel
 * /admin (ver docs/ARCHITECTURE.md: o contador de visualizações por artigo
 * vive no Supabase; isto é só para a visão geral de tráfego, consultada no
 * painel do Firebase/GA4, não dentro desta app), e só depois de
 * consentimento de cookies (ver lib/consent.ts).
 * Sem VITE_GA_MEASUREMENT_ID definido (ex.: antes de o projeto Firebase
 * existir), não faz nada — evita carregar um script quebrado em dev/staging.
 */
declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

let injected = false

export function useAnalytics(granted: boolean): void {
  useEffect(() => {
    if (!granted || injected) return
    const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
    if (!measurementId) return
    injected = true

    window.dataLayer = window.dataLayer || []
    const gtag = (...args: unknown[]) => window.dataLayer!.push(args)
    gtag('js', new Date())
    gtag('config', measurementId)

    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
    document.head.appendChild(script)
  }, [granted])
}
