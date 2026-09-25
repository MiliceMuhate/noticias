import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

/**
 * Uma linha de `settings` como rascunho editável: lê, deixa editar localmente
 * e grava com upsert (não update — se a linha não existir, um update fica em
 * silêncio sem gravar nada; já aconteceu neste projeto, o seed nunca chegou a
 * correr no hosted). Campos em falta na BD são preenchidos com `fallback`,
 * e campos que a BD tem mas este ecrã não conhece são preservados ao gravar.
 */
export function useSetting<T extends object>(key: string, fallback: T) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['settings', key],
    queryFn: async (): Promise<T> => {
      const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle()
      if (error) throw new Error(error.message)
      const value = data?.value
      if (Array.isArray(fallback)) return (Array.isArray(value) ? value : fallback) as T
      return value && typeof value === 'object' && !Array.isArray(value) ? ({ ...fallback, ...value } as T) : fallback
    },
  })
  const [draft, setDraft] = useState<T | null>(null)

  useEffect(() => {
    if (query.data && !draft) setDraft(query.data)
  }, [query.data, draft])

  const save = useMutation({
    mutationFn: async (value: T) => {
      const { error } = await supabase.from('settings').upsert({ key, value: value as never })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, value) => {
      queryClient.setQueryData(['settings', key], value)
      setDraft(value)
    },
  })

  const dirty = !!draft && !!query.data && JSON.stringify(draft) !== JSON.stringify(query.data)
  return { draft, setDraft, save, dirty, isLoading: query.isLoading, error: query.error }
}
