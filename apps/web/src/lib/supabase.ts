import { createClient } from '@supabase/supabase-js'
import type { Database } from '@repo/shared'

// Guardrail #5: o frontend usa APENAS a chave anon + sessão de utilizador.
const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY em falta (ver apps/web/.env.example)')
}

// No servidor (SSR) não há sessão nem localStorage: é só um leitor anónimo do
// site público, partilhado por todos os pedidos — nunca guarda nem renova tokens.
const isServer = typeof window === 'undefined'

export const supabase = createClient<Database>(
  url,
  anonKey,
  isServer ? { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } : undefined,
)
