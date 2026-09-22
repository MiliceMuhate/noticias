import { useEffect } from 'react'

/**
 * Google AdSense (Auto ads) — só no site público, nunca no painel /admin.
 * Sem VITE_ADSENSE_CLIENT_ID definido (ex.: antes de a conta ser aprovada),
 * não faz nada — evita carregar um script quebrado em dev/staging.
 */
let injected = false

export function useAdSense(): void {
  useEffect(() => {
    const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined
    if (!clientId || injected) return
    injected = true

    const script = document.createElement('script')
    script.async = true
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`
    script.crossOrigin = 'anonymous'
    document.head.appendChild(script)
  }, [])
}
