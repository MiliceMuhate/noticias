import { useEffect } from 'react'
import { ensureConsentDefaults, gtag } from './consent'

/**
 * Google Analytics (Firebase/GA4) — só no site público, nunca no painel
 * /admin (ver docs/ARCHITECTURE.md: o contador de visualizações por artigo
 * vive no Supabase; isto é só para a visão geral de tráfego, consultada no
 * painel do Firebase/GA4, não dentro desta app).
 * Carrega sempre, mas em Consent Mode v2 (lib/consent.ts): na UE/Reino
 * Unido/Suíça não grava cookies até o leitor aceitar na mensagem da Google.
 * Sem VITE_GA_MEASUREMENT_ID definido (ex.: antes de o projeto Firebase
 * existir), não faz nada — evita carregar um script quebrado em dev/staging.
 */
let injected = false

export function useAnalytics(): void {
  useEffect(() => {
    if (injected) return
    const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
    if (!measurementId) return
    injected = true

    ensureConsentDefaults()
    gtag('js', new Date())
    gtag('config', measurementId)

    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
    document.head.appendChild(script)
  }, [])
}
