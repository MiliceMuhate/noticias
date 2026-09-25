import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

/**
 * `false` no servidor e durante a hidratação, `true` a partir daí (e logo à
 * primeira num render só de cliente, ex. o painel /admin). Para o que só o
 * browser sabe — fuso horário do leitor, "há 5 min", localStorage — sem o
 * HTML hidratado divergir do que o servidor enviou.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}
