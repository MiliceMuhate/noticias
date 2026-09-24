import { Link } from 'react-router-dom'
import { useConsent } from '../../lib/consent'
import { PublicFooter, PublicHeader } from './PublicChrome'

/** /politica-de-privacidade — sem login. Ver lib/consent.ts para o banner que a referencia. */

export default function PrivacyPolicy() {
  const consent = useConsent()

  return (
    <div className="min-h-screen bg-white font-body">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1 font-display text-sm font-medium uppercase tracking-wide text-delvis-teal hover:text-delvis-teal-600"
        >
          ← Notícias de futebol
        </Link>

        <h1 className="font-display text-3xl font-semibold text-delvis-ink">Política de privacidade</h1>
        <p className="mt-2 text-sm text-delvis-mute">Última atualização: 24 de setembro de 2026.</p>

        <div className="prose prose-slate mt-8 max-w-none font-body prose-headings:font-display prose-headings:font-medium prose-headings:text-delvis-ink prose-a:font-semibold prose-a:text-delvis-teal prose-strong:text-delvis-ink">
          <h2>O que este site é</h2>
          <p>
            O footballtrend é um site de notícias de futebol. Não tens de criar conta nem sessão para o ler — só a
            equipa editorial tem acesso a um painel de administração próprio, à parte.
          </p>

          <h2>Contagem de visualizações por artigo</h2>
          <p>
            Cada artigo tem um contador de visualizações, incrementado automaticamente quando o abres. É só um
            número por artigo — não fica associado a ti, ao teu dispositivo, nem a nenhum identificador. Por não ser
            um dado pessoal, funciona sempre, mesmo que rejeites os cookies abaixo.
          </p>

          <h2>Cookies e ferramentas de terceiros</h2>
          <p>
            Só carregamos as ferramentas seguintes depois de aceitares no aviso que aparece na primeira visita.
            Podes mudar de ideias a qualquer momento no rodapé ("Gerir cookies").
          </p>
          <ul>
            <li>
              <strong>Google Analytics (Firebase)</strong> — estatísticas de visitas: que páginas são lidas, de onde
              vêm os visitantes (país/região aproximados, a partir do IP), que dispositivo e navegador usam. Não
              usamos isto para te identificar individualmente.
            </li>
            <li>
              <strong>Google AdSense</strong> — mostra os anúncios que financiam o site e mede o seu desempenho.
              Pode usar cookies para personalizar anúncios com base no teu histórico de navegação noutros sites.
            </li>
          </ul>
          <p>
            Ambas são operadas pela Google Ireland Limited. Podes ler a{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
              política de privacidade da Google
            </a>{' '}
            e, especificamente sobre anúncios, a{' '}
            <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noreferrer">
              página sobre tecnologias de anúncios
            </a>
            . Não controlamos quanto tempo a Google guarda estes dados — isso segue as políticas de retenção dela,
            não as nossas.
          </p>

          <h2>Se rejeitares</h2>
          <p>
            O site funciona na mesma, por completo — a rejeição só impede o Analytics e o AdSense (que nem chegam a
            carregar). Podes continuar a ler e pesquisar notícias sem qualquer limitação.
          </p>

          <h2>Os teus direitos</h2>
          <p>
            Podes pedir para saber que dados temos sobre ti, corrigi-los, ou pedir que sejam apagados. Como não
            temos contas de utilizador nem guardamos identificadores próprios — os únicos dados de visitantes que
            existem são os que o Analytics/AdSense possam ter recolhido, do lado da Google — o pedido mais direto é
            geri-lo tu mesmo a partir das definições de privacidade da tua conta Google, ou contactar-nos abaixo e
            encaminhamos o pedido.
          </p>

          <h2>Contacto</h2>
          <p>
            Para qualquer questão sobre esta política ou os teus dados:{' '}
            <a href="mailto:milicemuhate@gmail.com">milicemuhate@gmail.com</a>.
          </p>
        </div>

        {consent.status !== null && (
          <p className="mt-8 border-t border-delvis-line pt-4 text-xs text-delvis-mute">
            A tua escolha atual: {consent.status === 'accepted' ? 'aceitaste' : 'rejeitaste'} cookies não essenciais.{' '}
            <button type="button" onClick={consent.reset} className="font-semibold text-delvis-teal underline">
              Mudar
            </button>
            .
          </p>
        )}
      </main>
      <PublicFooter />
    </div>
  )
}
