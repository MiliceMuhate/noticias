import { supabase } from './supabase'

/**
 * Chamada ao backend FastAPI (apps/api) a partir do painel, pelo proxy /api do
 * apps/web/server.js. Leva o JWT da sessão Supabase do operador — a API
 * confirma-o e exige role de operador (apps/api/app/auth.py).
 */
export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('sessão expirada — volta a entrar no painel')
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = (await response.json().catch(() => ({}))) as T & { detail?: unknown }
  if (!response.ok) throw new Error(typeof json.detail === 'string' ? json.detail : `HTTP ${response.status}`)
  return json
}
