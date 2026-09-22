import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

/**
 * Subscreve alterações em `topics` e `content_items` via Supabase Realtime e
 * invalida as queries respetivas — a fila de revisão e a vista de tendências
 * atualizam ao vivo (Fase 3 do TASKS.md).
 */
export function useRealtime(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_items' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['content_items'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topics' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['topics'] })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])
}
