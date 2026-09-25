import type { JSX } from 'react'
import type { Lang } from '../../lib/i18n'

/**
 * Conteúdo traduzido da /politica-de-privacidade. O PrivacyPolicy.tsx renderiza
 * `<content.Body onManageCookies={openConsentSettings} />` dentro da div `prose`.
 *
 * Nota: o corpo atual não tem links internos (`<Link>`) — só links externos (Google)
 * e um mailto — por isso não precisa de `localizedPath`. Se algum dia se juntar um
 * `<Link>`, construir o caminho com `localizedPath(lang, ...)`.
 */

export interface PrivacyContent {
  title: string
  updated: string
  Body: (props: { onManageCookies: () => void }) => JSX.Element
}

type BodyProps = { onManageCookies: () => void }

function BodyPt(_props: BodyProps): JSX.Element {
  return (
    <>
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
        Usamos as ferramentas seguintes. Se estiveres na União Europeia, no Reino Unido ou na Suíça, a Google
        mostra-te na primeira visita uma mensagem de consentimento (certificada pelo IAB TCF) e, até decidires,
        nenhuma delas grava cookies. Noutros países ficam ativas por omissão. Podes rever a tua escolha a
        qualquer momento no rodapé ("Gerir cookies").
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
        O site funciona na mesma, por completo. O Analytics deixa de gravar cookies e passa a enviar só medições
        anónimas, sem identificadores; os anúncios continuam a aparecer, mas não personalizados. Podes continuar
        a ler e pesquisar notícias sem qualquer limitação.
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
    </>
  )
}

function BodyEn(_props: BodyProps): JSX.Element {
  return (
    <>
      <h2>What this site is</h2>
      <p>
        footballtrend is a football news site. You don't need to create an account or sign in to read it — only
        the editorial team has access to a separate administration panel of its own.
      </p>

      <h2>Article view counts</h2>
      <p>
        Each article has a view counter, incremented automatically when you open it. It is just one number per
        article — it is not linked to you, your device, or any identifier. Because it is not personal data, it
        always works, even if you reject the cookies below.
      </p>

      <h2>Cookies and third-party tools</h2>
      <p>
        We use the following tools. If you are in the European Union, the United Kingdom or Switzerland, Google
        shows you a consent message (IAB TCF certified) on your first visit and, until you decide, neither of them
        sets cookies. In other countries they are active by default. You can review your choice at any time from
        the footer ("Manage cookies").
      </p>
      <ul>
        <li>
          <strong>Google Analytics (Firebase)</strong> — visit statistics: which pages are read, where visitors
          come from (approximate country/region, based on IP address), and which device and browser they use. We
          do not use this to identify you individually.
        </li>
        <li>
          <strong>Google AdSense</strong> — shows the ads that fund the site and measures their performance. It
          may use cookies to personalise ads based on your browsing history on other sites.
        </li>
      </ul>
      <p>
        Both are operated by Google Ireland Limited. You can read{' '}
        <a href="https://policies.google.com/privacy?hl=en" target="_blank" rel="noreferrer">
          Google's privacy policy
        </a>{' '}
        and, specifically regarding ads, the{' '}
        <a href="https://policies.google.com/technologies/ads?hl=en" target="_blank" rel="noreferrer">
          page on advertising technologies
        </a>
        . We do not control how long Google keeps this data — that follows Google's own retention policies, not
        ours.
      </p>

      <h2>If you reject</h2>
      <p>
        The site still works fully. Analytics stops setting cookies and only sends anonymous measurements, with no
        identifiers; ads still appear, but they are not personalised. You can keep reading and searching the news
        without any limitation.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to know what data we hold about you, have it corrected, or ask for it to be deleted. Since we
        have no user accounts and store no identifiers of our own — the only visitor data that exists is whatever
        Analytics/AdSense may have collected, on Google's side — the most direct route is to manage it yourself
        from the privacy settings of your Google account, or to contact us below and we will forward the request.
      </p>

      <h2>Contact</h2>
      <p>
        For any question about this policy or your data:{' '}
        <a href="mailto:milicemuhate@gmail.com">milicemuhate@gmail.com</a>.
      </p>
    </>
  )
}

function BodyEs(_props: BodyProps): JSX.Element {
  return (
    <>
      <h2>Qué es este sitio</h2>
      <p>
        footballtrend es un sitio de noticias de fútbol. No tienes que crear una cuenta ni iniciar sesión para
        leerlo — solo el equipo editorial tiene acceso a un panel de administración propio, aparte.
      </p>

      <h2>Recuento de visualizaciones por artículo</h2>
      <p>
        Cada artículo tiene un contador de visualizaciones que se incrementa automáticamente cuando lo abres. Es
        solo un número por artículo — no queda asociado a ti, a tu dispositivo ni a ningún identificador. Como no
        es un dato personal, funciona siempre, incluso si rechazas las cookies que se describen abajo.
      </p>

      <h2>Cookies y herramientas de terceros</h2>
      <p>
        Usamos las siguientes herramientas. Si estás en la Unión Europea, el Reino Unido o Suiza, Google te muestra
        en tu primera visita un mensaje de consentimiento (certificado por el IAB TCF) y, hasta que decidas,
        ninguna de ellas guarda cookies. En otros países están activas por defecto. Puedes revisar tu elección en
        cualquier momento desde el pie de página ("Gestionar cookies").
      </p>
      <ul>
        <li>
          <strong>Google Analytics (Firebase)</strong> — estadísticas de visitas: qué páginas se leen, de dónde
          vienen los visitantes (país/región aproximados, a partir de la IP), qué dispositivo y navegador usan. No
          lo usamos para identificarte individualmente.
        </li>
        <li>
          <strong>Google AdSense</strong> — muestra los anuncios que financian el sitio y mide su rendimiento.
          Puede usar cookies para personalizar anuncios según tu historial de navegación en otros sitios.
        </li>
      </ul>
      <p>
        Ambas son operadas por Google Ireland Limited. Puedes leer la{' '}
        <a href="https://policies.google.com/privacy?hl=es" target="_blank" rel="noreferrer">
          política de privacidad de Google
        </a>{' '}
        y, específicamente sobre anuncios, la{' '}
        <a href="https://policies.google.com/technologies/ads?hl=es" target="_blank" rel="noreferrer">
          página sobre tecnologías publicitarias
        </a>
        . No controlamos cuánto tiempo conserva Google estos datos — eso depende de sus propias políticas de
        conservación, no de las nuestras.
      </p>

      <h2>Si las rechazas</h2>
      <p>
        El sitio sigue funcionando por completo. Analytics deja de guardar cookies y solo envía mediciones
        anónimas, sin identificadores; los anuncios siguen apareciendo, pero no personalizados. Puedes seguir
        leyendo y buscando noticias sin ninguna limitación.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes solicitar saber qué datos tenemos sobre ti, corregirlos o pedir que se eliminen. Como no tenemos
        cuentas de usuario ni guardamos identificadores propios — los únicos datos de visitantes que existen son
        los que Analytics/AdSense hayan podido recopilar, del lado de Google —, la vía más directa es gestionarlo
        tú mismo desde la configuración de privacidad de tu cuenta de Google, o contactarnos abajo y nosotros
        remitiremos la solicitud.
      </p>

      <h2>Contacto</h2>
      <p>
        Para cualquier pregunta sobre esta política o tus datos:{' '}
        <a href="mailto:milicemuhate@gmail.com">milicemuhate@gmail.com</a>.
      </p>
    </>
  )
}

function BodyFr(_props: BodyProps): JSX.Element {
  return (
    <>
      <h2>Ce qu'est ce site</h2>
      <p>
        footballtrend est un site d'actualités football. Vous n'avez pas besoin de créer un compte ni de vous
        connecter pour le lire — seule l'équipe éditoriale a accès à un panneau d'administration qui lui est
        propre, à part.
      </p>

      <h2>Comptage des vues par article</h2>
      <p>
        Chaque article dispose d'un compteur de vues, incrémenté automatiquement lorsque vous l'ouvrez. Il s'agit
        simplement d'un nombre par article — il n'est associé ni à vous, ni à votre appareil, ni à aucun
        identifiant. Comme il ne s'agit pas d'une donnée personnelle, il fonctionne toujours, même si vous refusez
        les cookies ci-dessous.
      </p>

      <h2>Cookies et outils tiers</h2>
      <p>
        Nous utilisons les outils suivants. Si vous êtes dans l'Union européenne, au Royaume-Uni ou en Suisse,
        Google vous affiche lors de votre première visite un message de consentement (certifié IAB TCF) et, tant que
        vous n'avez pas choisi, aucun d'eux ne dépose de cookies. Dans les autres pays, ils sont actifs par défaut.
        Vous pouvez revoir votre choix à tout moment depuis le pied de page (« Gérer les cookies »).
      </p>
      <ul>
        <li>
          <strong>Google Analytics (Firebase)</strong> — statistiques de visites : quelles pages sont lues, d'où
          viennent les visiteurs (pays/région approximatifs, à partir de l'adresse IP), quel appareil et quel
          navigateur ils utilisent. Nous ne l'utilisons pas pour vous identifier individuellement.
        </li>
        <li>
          <strong>Google AdSense</strong> — affiche les annonces qui financent le site et mesure leurs
          performances. Il peut utiliser des cookies pour personnaliser les annonces en fonction de votre
          historique de navigation sur d'autres sites.
        </li>
      </ul>
      <p>
        Les deux sont exploités par Google Ireland Limited. Vous pouvez consulter les{' '}
        <a href="https://policies.google.com/privacy?hl=fr" target="_blank" rel="noreferrer">
          règles de confidentialité de Google
        </a>{' '}
        et, plus précisément au sujet des annonces, la{' '}
        <a href="https://policies.google.com/technologies/ads?hl=fr" target="_blank" rel="noreferrer">
          page sur les technologies publicitaires
        </a>
        . Nous ne contrôlons pas la durée pendant laquelle Google conserve ces données — cela relève de ses propres
        règles de conservation, et non des nôtres.
      </p>

      <h2>Si vous refusez</h2>
      <p>
        Le site fonctionne tout de même, entièrement. Analytics ne dépose plus de cookies et n'envoie que des
        mesures anonymes, sans identifiants ; les publicités continuent de s'afficher, mais ne sont pas
        personnalisées. Vous pouvez continuer à lire et à rechercher des actualités sans aucune restriction.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous pouvez demander à savoir quelles données nous détenons à votre sujet, les faire corriger ou demander
        leur suppression. Comme nous n'avons pas de comptes utilisateurs et ne conservons aucun identifiant propre
        — les seules données de visiteurs qui existent sont celles qu'Analytics/AdSense ont pu collecter, du côté
        de Google —, le plus simple est de les gérer vous-même depuis les paramètres de confidentialité de votre
        compte Google, ou de nous contacter ci-dessous et nous transmettrons la demande.
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question concernant cette politique ou vos données :{' '}
        <a href="mailto:milicemuhate@gmail.com">milicemuhate@gmail.com</a>.
      </p>
    </>
  )
}

export const PRIVACY_CONTENT: Record<Lang, PrivacyContent> = {
  pt: {
    title: 'Política de privacidade',
    updated: 'Última atualização: 25 de setembro de 2026.',
    Body: BodyPt,
  },
  en: {
    title: 'Privacy policy',
    updated: 'Last updated: September 25, 2026.',
    Body: BodyEn,
  },
  es: {
    title: 'Política de privacidad',
    updated: 'Última actualización: 25 de septiembre de 2026.',
    Body: BodyEs,
  },
  fr: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : 25 septembre 2026.',
    Body: BodyFr,
  },
}
