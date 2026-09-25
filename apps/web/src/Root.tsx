import { StrictMode, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './lib/auth'

/** Providers comuns ao render do servidor (entry-server) e ao do browser
 * (entry-client) — só o router muda (StaticRouter vs BrowserRouter). */

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000 } },
  })
}

export function Root({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
