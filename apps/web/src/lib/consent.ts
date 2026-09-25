/**
 * Consentimento de cookies — gerido pela CMP certificada da Google (AdSense →
 * "Privacidade e mensagens" → RGPD), não por um banner nosso. O Google exige
 * uma CMP certificada (TCF) para servir anúncios na UE/EEE, Reino Unido e
 * Suíça; a mensagem vem dentro do próprio script do AdSense (lib/adsense.ts),
 * por isso esse script carrega sempre — é ele que pergunta.
 *
 * O Google Analytics (lib/analytics.ts) segue o Consent Mode v2: nessas regiões
 * arranca com tudo `denied` (sem cookies, só pings anónimos) e a CMP da Google
 * atualiza o estado quando o leitor decide. Fora delas, `granted` por omissão —
 * a CMP da Google também não mostra mensagem aí.
 */

declare global {
  interface Window {
    dataLayer?: unknown[]
    googlefc?: { callbackQueue?: unknown[]; showRevocationMessage?: () => void }
  }
}

/** UE/EEE (27 + Islândia, Liechtenstein, Noruega), Reino Unido e Suíça — ISO 3166-1. */
const CONSENT_REQUIRED_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT',
  'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH',
]

/** O `gtag` oficial: empurra o objeto `arguments` (não um array) para o dataLayer. */
export function gtag(..._args: unknown[]): void {
  window.dataLayer = window.dataLayer || []
  // eslint-disable-next-line prefer-rest-params -- espelha o snippet oficial do gtag.js à letra
  window.dataLayer.push(arguments)
}

let defaultsSet = false

/** Tem de correr antes de qualquer tag da Google (Analytics, AdSense). Idempotente. */
export function ensureConsentDefaults(): void {
  if (defaultsSet) return
  defaultsSet = true
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    region: CONSENT_REQUIRED_REGIONS,
    wait_for_update: 500, // dá tempo à CMP para aplicar uma escolha já feita numa visita anterior
  })
  gtag('consent', 'default', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
  })
}

/**
 * Reabre a mensagem de consentimento da Google (link "Gerir cookies"). A fila
 * `callbackQueue` corre a função assim que a CMP estiver carregada — funciona
 * mesmo que o clique chegue antes do script.
 */
export function openConsentSettings(): void {
  const googlefc = (window.googlefc = window.googlefc || {})
  googlefc.callbackQueue = googlefc.callbackQueue || []
  googlefc.callbackQueue.push(() => window.googlefc?.showRevocationMessage?.())
}
