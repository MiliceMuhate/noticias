import { useEffect } from 'react'
import { ensureConsentDefaults } from './consent'

/**
 * Google AdSense (Auto ads) — só no site público, nunca no painel /admin.
 * Carrega sempre: a mensagem de consentimento (CMP certificada da Google, ver
 * lib/consent.ts) vem dentro deste script — é ele que pergunta ao leitor na
 * UE/Reino Unido/Suíça e só depois serve anúncios personalizados.
 * Sem VITE_ADSENSE_CLIENT_ID definido (dev), não faz nada — evita impressões
 * de tráfego próprio/inválido a partir de localhost.
 */
let injected = false

export function useAdSense(): void {
  useEffect(() => {
    if (injected) return
    const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined
    if (!clientId) return
    injected = true

    ensureConsentDefaults()
    const script = document.createElement('script')
    script.async = true
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`
    script.crossOrigin = 'anonymous'
    document.head.appendChild(script)
  }, [])
}
