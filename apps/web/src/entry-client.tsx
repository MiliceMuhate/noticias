import { createRoot, hydrateRoot } from 'react-dom/client'
import { hydrate, type DehydratedState } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { createQueryClient, Root } from './Root'
import './index.css'

declare global {
  interface Window {
    __RQ_STATE__?: DehydratedState
  }
}

const queryClient = createQueryClient()
if (window.__RQ_STATE__) hydrate(queryClient, window.__RQ_STATE__)

const container = document.getElementById('root')!
const app = (
  <Root queryClient={queryClient}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Root>
)

// O site público chega já renderizado pelo servidor — hidrata-se. O painel
// /admin (e o fallback quando o SSR falha) chega com o #root vazio — render
// normal de cliente, como antes do SSR.
if (container.hasChildNodes()) hydrateRoot(container, app)
else createRoot(container).render(app)
