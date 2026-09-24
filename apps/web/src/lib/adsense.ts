import { useEffect } from 'react'

/**
 * Google AdSense (Auto ads) — só no site público, nunca no painel /admin, e só
 * depois de consentimento de cookies (ver lib/consent.ts — o RGPD exige que o
 * script nem carregue antes da decisão, não basta escondê-lo).
 * Sem VITE_ADSENSE_CLIENT_ID definido (ex.: antes de a conta ser aprovada),
 * não faz nada — evita carregar um script quebrado em dev/staging.
 */
let injected = false

export function useAdSense(granted: boolean): void {
  useEffect(() => {
    if (!granted || injected) return
    const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined
    if (!clientId) return
    injected = true

    const script = document.createElement('script')
    script.async = true
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`
    script.crossOrigin = 'anonymous'
    document.head.appendChild(script)
  }, [granted])
}
