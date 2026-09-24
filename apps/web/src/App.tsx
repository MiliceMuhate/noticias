import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { useRealtime } from './lib/useRealtime'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import ReviewQueue from './pages/ReviewQueue'
import Trends from './pages/Trends'
import Automacao from './pages/Automacao'
import Config from './pages/Config'
import Costs from './pages/Costs'
import NewsList from './pages/public/NewsList'
import ArticlePage from './pages/public/ArticlePage'
import PrivacyPolicy from './pages/public/PrivacyPolicy'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<NewsList />} />
      <Route path="/artigo/:slug" element={<ArticlePage />} />
      <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
      <Route path="/admin/*" element={<Admin />} />
    </Routes>
  )
}

function Admin() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">A carregar…</div>
  }

  if (!session) return <Login />

  return <Dashboard email={session.user.email ?? ''} />
}

function Dashboard({ email }: { email: string }) {
  useRealtime()

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm font-medium ${
      isActive ? 'bg-pitch-700 text-white' : 'text-pitch-200 hover:bg-pitch-800 hover:text-white'
    }`

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b-4 border-gold-500 bg-pitch-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-white">footballtrend <span className="font-normal text-pitch-300">· painel</span></h1>
            <nav className="flex gap-1">
              <NavLink to="revisao" className={navClass}>Fila de revisão</NavLink>
              <NavLink to="tendencias" className={navClass}>Tendências</NavLink>
              <NavLink to="automacao" className={navClass}>Piloto automático</NavLink>
              <NavLink to="gastos" className={navClass}>Gastos IA</NavLink>
              <NavLink to="config" className={navClass}>Configuração</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-pitch-200">
            <a href="/" className="hover:text-white hover:underline">Ver site</a>
            <span>{email}</span>
            <button
              onClick={() => void supabase.auth.signOut()}
              className="rounded-md border border-pitch-700 px-3 py-1.5 hover:bg-pitch-800"
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route index element={<Navigate to="revisao" replace />} />
          <Route path="revisao" element={<ReviewQueue />} />
          <Route path="tendencias" element={<Trends />} />
          <Route path="automacao" element={<Automacao />} />
          <Route path="gastos" element={<Costs />} />
          <Route path="config" element={<Config />} />
        </Routes>
      </main>
    </div>
  )
}
