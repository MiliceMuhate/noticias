import type { JSX } from 'react'
import { Link } from 'react-router-dom'
import { type Lang, localizedPath } from '../../lib/i18n'

/**
 * Conteúdo das páginas institucionais (/sobre, /contacto, /politica-editorial)
 * em cada língua — sinal de credibilidade (E-E-A-T) e requisito do Google
 * News: quem publica, quem responde pelo conteúdo, como se trabalha.
 *
 * Tudo o que aqui se afirma tem de corresponder ao que o sistema faz de facto
 * (ver docs/ARCHITECTURE.md): com o piloto automático ligado, nem todos os
 * artigos passam por um humano antes de publicar — por isso o texto nunca o
 * diz.
 */

export const PUBLISHER_NAME = 'Pixa Editora'
export const CONTACT_EMAIL = 'milicemuhate@gmail.com'

export type InfoPageKey = 'about' | 'contact' | 'editorial'

export const INFO_PAGE_PATHS: Record<InfoPageKey, string> = {
  about: '/sobre',
  contact: '/contacto',
  editorial: '/politica-editorial',
}

export interface InfoBodyProps {
  /** editor responsável (published_articles.editor) — null se ainda não houver artigos */
  editor: string | null
}

export interface InfoPageContent {
  title: string
  description: string
  Body: (props: InfoBodyProps) => JSX.Element
}

function Mail() {
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
}

function PageLink({ lang, page, children }: { lang: Lang; page: InfoPageKey; children: string }) {
  return <Link to={localizedPath(lang, INFO_PAGE_PATHS[page])}>{children}</Link>
}

// ---------------------------------------------------------------- pt

function AboutPt({ editor }: InfoBodyProps) {
  return (
    <>
      <p>
        O <strong>footballtrend</strong> é um site de notícias de futebol publicado pela{' '}
        <strong>{PUBLISHER_NAME}</strong>. Acompanhamos transferências, resultados, competições e seleções, em
        português, inglês, espanhol e francês.
      </p>

      <h2>Como trabalhamos</h2>
      <p>
        Cada artigo parte de uma notícia já publicada por um órgão de comunicação identificado — o nome da fonte e a
        ligação para o original aparecem sempre no artigo. Não fazemos reportagem no terreno nem publicamos rumores
        sem fonte: o nosso trabalho é organizar os factos, explicá-los e dar-lhes contexto, numa escrita própria.
      </p>
      <p>
        Os artigos são redigidos com assistência de inteligência artificial, segundo regras editoriais definidas e
        supervisionadas pela nossa equipa, e passam por verificações de originalidade e de fidelidade aos factos
        antes de serem publicados. Os detalhes estão na{' '}
        <PageLink lang="pt" page="editorial">
          política editorial
        </PageLink>
        .
      </p>

      <h2>Quem somos</h2>
      <ul>
        <li>
          Publicação: <strong>{PUBLISHER_NAME}</strong>
        </li>
        {editor && (
          <li>
            Editor responsável: <strong>{editor}</strong>
          </li>
        )}
        <li>
          Contacto: <Mail />
        </li>
      </ul>
    </>
  )
}

function ContactPt(_props: InfoBodyProps) {
  return (
    <>
      <p>
        Para falar com a redação do footballtrend ({PUBLISHER_NAME}), escreve para <Mail />.
      </p>

      <h2>Correções</h2>
      <p>
        Encontraste um erro num artigo? Envia-nos a ligação do artigo e o que está errado. Corrigimos assim que
        confirmarmos — ver a secção de correções da{' '}
        <PageLink lang="pt" page="editorial">
          política editorial
        </PageLink>
        .
      </p>

      <h2>Direitos de autor e pedidos de remoção</h2>
      <p>
        Se és titular de direitos sobre um conteúdo citado ou uma imagem usada num artigo e queres que seja
        retirado, escreve-nos com a ligação do artigo e a identificação do conteúdo em causa.
      </p>

      <h2>Outros assuntos</h2>
      <p>Questões editoriais, parcerias ou publicidade: o mesmo endereço.</p>
    </>
  )
}

function EditorialPt({ editor }: InfoBodyProps) {
  return (
    <>
      <p>
        Esta política descreve como o footballtrend produz, verifica e corrige o que publica. Aplica-se a todos os
        artigos, em todas as línguas.
      </p>

      <h2>1. Fontes</h2>
      <p>
        Só escrevemos a partir de notícias já publicadas por órgãos de comunicação identificados, escolhidos pela
        equipa editorial. Não publicamos rumores sem fonte nem factos que a fonte não contenha. Cada artigo indica o
        nome da fonte e inclui a ligação para a notícia original.
      </p>

      <h2>2. Uso de inteligência artificial</h2>
      <p>
        Os artigos são redigidos com assistência de inteligência artificial. Primeiro, os factos da notícia original
        (quem, o quê, quando, números, declarações) são extraídos para uma ficha. O artigo é depois escrito a partir
        dessa ficha, sem acesso ao texto original — para que o resultado seja uma redação própria e não uma cópia
        reformulada.
      </p>

      <h2>3. Verificações antes de publicar</h2>
      <ul>
        <li>
          <strong>Originalidade:</strong> uma comparação automática com o texto da fonte deteta frases e sequências
          de palavras demasiado próximas do original.
        </li>
        <li>
          <strong>Auditoria:</strong> uma segunda revisão procura passagens copiadas, afirmações que não estão na
          fonte e artigos que seguem a estrutura do original frase a frase. Os problemas encontrados são corrigidos e
          o artigo é verificado de novo.
        </li>
        <li>
          <strong>Publicação:</strong> a equipa editorial aprova os artigos, ou define critérios sob os quais os
          artigos que passaram todas as verificações são publicados automaticamente. O que não cumpre esses critérios
          aguarda revisão humana. Artigos que não passam as verificações não são publicados.
        </li>
      </ul>

      <h2>4. Traduções</h2>
      <p>
        As versões em inglês, espanhol e francês são traduzidas com inteligência artificial a partir do artigo em
        português já publicado. Cada tradução é verificada quanto à fidelidade ao artigo português e quanto à
        originalidade em relação à notícia de origem, e a equipa revê regularmente uma amostra. Cada tradução
        indica que o é e liga para o original em português.
      </p>

      <h2>5. Correções</h2>
      <p>
        Corrigimos os erros assim que os confirmamos. Se encontrares um, escreve para <Mail /> com a ligação do
        artigo. Quando um artigo não pode ser corrigido, é retirado.
      </p>

      <h2>6. Publicidade e independência</h2>
      <p>
        O site mostra anúncios (Google AdSense) para financiar o seu funcionamento. Os anunciantes não influenciam o
        que publicamos, e não publicamos conteúdo patrocinado apresentado como notícia.
      </p>

      <h2>7. Responsabilidade</h2>
      <p>
        O footballtrend é publicado pela <strong>{PUBLISHER_NAME}</strong>
        {editor ? (
          <>
            , com <strong>{editor}</strong> como editor responsável
          </>
        ) : null}
        . Contacto: <Mail />.
      </p>
    </>
  )
}

// ---------------------------------------------------------------- en

function AboutEn({ editor }: InfoBodyProps) {
  return (
    <>
      <p>
        <strong>footballtrend</strong> is a football news site published by <strong>{PUBLISHER_NAME}</strong>. We
        cover transfers, results, competitions and national teams, in Portuguese, English, Spanish and French.
      </p>

      <h2>How we work</h2>
      <p>
        Every article starts from a news story already published by an identified media outlet — the name of the
        source and the link to the original always appear in the article. We do not do on-the-ground reporting, nor
        do we publish unsourced rumours: our work is to organise the facts, explain them and give them context, in our
        own writing.
      </p>
      <p>
        Articles are written with the assistance of artificial intelligence, following editorial rules defined and
        overseen by our team, and go through originality and factual-accuracy checks before they are published. The
        details are in our{' '}
        <PageLink lang="en" page="editorial">
          editorial policy
        </PageLink>
        .
      </p>

      <h2>Who we are</h2>
      <ul>
        <li>
          Publisher: <strong>{PUBLISHER_NAME}</strong>
        </li>
        {editor && (
          <li>
            Editor in charge: <strong>{editor}</strong>
          </li>
        )}
        <li>
          Contact: <Mail />
        </li>
      </ul>
    </>
  )
}

function ContactEn(_props: InfoBodyProps) {
  return (
    <>
      <p>
        To reach the footballtrend newsroom ({PUBLISHER_NAME}), write to <Mail />.
      </p>

      <h2>Corrections</h2>
      <p>
        Found an error in an article? Send us the link to the article and what is wrong. We correct it as soon as we
        have confirmed it — see the corrections section of our{' '}
        <PageLink lang="en" page="editorial">
          editorial policy
        </PageLink>
        .
      </p>

      <h2>Copyright and removal requests</h2>
      <p>
        If you hold the rights to quoted content or to an image used in an article and want it removed, write to us
        with the link to the article and the identification of the content in question.
      </p>

      <h2>Other matters</h2>
      <p>Editorial questions, partnerships or advertising: the same address.</p>
    </>
  )
}

function EditorialEn({ editor }: InfoBodyProps) {
  return (
    <>
      <p>
        This policy describes how footballtrend produces, checks and corrects what it publishes. It applies to all
        articles, in all languages.
      </p>

      <h2>1. Sources</h2>
      <p>
        We only write from news stories already published by identified media outlets, chosen by the editorial team.
        We do not publish unsourced rumours or facts that the source does not contain. Every article states the name
        of the source and includes the link to the original story.
      </p>

      <h2>2. Use of artificial intelligence</h2>
      <p>
        Articles are written with the assistance of artificial intelligence. First, the facts of the original story
        (who, what, when, figures, statements) are extracted into a fact sheet. The article is then written from that
        fact sheet, without access to the original text — so that the result is our own writing and not a reworded
        copy.
      </p>

      <h2>3. Checks before publication</h2>
      <ul>
        <li>
          <strong>Originality:</strong> an automatic comparison with the source text detects sentences and sequences
          of words that are too close to the original.
        </li>
        <li>
          <strong>Audit:</strong> a second review looks for copied passages, claims that are not in the source and
          articles that follow the structure of the original sentence by sentence. The problems found are fixed and
          the article is checked again.
        </li>
        <li>
          <strong>Publication:</strong> the editorial team approves articles, or sets criteria under which articles
          that have passed all checks are published automatically. Whatever does not meet those criteria awaits human
          review. Articles that do not pass the checks are not published.
        </li>
      </ul>

      <h2>4. Translations</h2>
      <p>
        The English, Spanish and French versions are translated with artificial intelligence from the Portuguese
        article once it has been published. Each translation is checked for faithfulness to the Portuguese article and
        for originality relative to the source story, and the team regularly reviews a sample. Each translation states
        that it is one and links to the Portuguese original.
      </p>

      <h2>5. Corrections</h2>
      <p>
        We correct errors as soon as we confirm them. If you find one, write to <Mail /> with the link to the article.
        When an article cannot be corrected, it is removed.
      </p>

      <h2>6. Advertising and independence</h2>
      <p>
        The site shows ads (Google AdSense) to fund its operation. Advertisers do not influence what we publish, and we
        do not publish sponsored content presented as news.
      </p>

      <h2>7. Accountability</h2>
      <p>
        footballtrend is published by <strong>{PUBLISHER_NAME}</strong>
        {editor ? (
          <>
            , with <strong>{editor}</strong> as editor in charge
          </>
        ) : null}
        . Contact: <Mail />.
      </p>
    </>
  )
}

// ---------------------------------------------------------------- es

function AboutEs({ editor }: InfoBodyProps) {
  return (
    <>
      <p>
        <strong>footballtrend</strong> es un sitio de noticias de fútbol publicado por{' '}
        <strong>{PUBLISHER_NAME}</strong>. Seguimos fichajes, resultados, competiciones y selecciones, en portugués,
        inglés, español y francés.
      </p>

      <h2>Cómo trabajamos</h2>
      <p>
        Cada artículo parte de una noticia ya publicada por un medio de comunicación identificado: el nombre de la
        fuente y el enlace al original aparecen siempre en el artículo. No hacemos reportajes sobre el terreno ni
        publicamos rumores sin fuente: nuestro trabajo es ordenar los hechos, explicarlos y darles contexto, con una
        redacción propia.
      </p>
      <p>
        Los artículos se redactan con asistencia de inteligencia artificial, según reglas editoriales definidas y
        supervisadas por nuestro equipo, y pasan por verificaciones de originalidad y de fidelidad a los hechos antes
        de publicarse. Los detalles están en la{' '}
        <PageLink lang="es" page="editorial">
          política editorial
        </PageLink>
        .
      </p>

      <h2>Quiénes somos</h2>
      <ul>
        <li>
          Publicación: <strong>{PUBLISHER_NAME}</strong>
        </li>
        {editor && (
          <li>
            Editor responsable: <strong>{editor}</strong>
          </li>
        )}
        <li>
          Contacto: <Mail />
        </li>
      </ul>
    </>
  )
}

function ContactEs(_props: InfoBodyProps) {
  return (
    <>
      <p>
        Para hablar con la redacción de footballtrend ({PUBLISHER_NAME}), escribe a <Mail />.
      </p>

      <h2>Correcciones</h2>
      <p>
        ¿Encontraste un error en un artículo? Envíanos el enlace del artículo y lo que está mal. Lo corregimos en cuanto
        lo confirmemos: consulta la sección de correcciones de la{' '}
        <PageLink lang="es" page="editorial">
          política editorial
        </PageLink>
        .
      </p>

      <h2>Derechos de autor y solicitudes de retirada</h2>
      <p>
        Si eres titular de derechos sobre un contenido citado o una imagen usada en un artículo y quieres que se
        retire, escríbenos con el enlace del artículo y la identificación del contenido en cuestión.
      </p>

      <h2>Otros asuntos</h2>
      <p>Cuestiones editoriales, colaboraciones o publicidad: la misma dirección.</p>
    </>
  )
}

function EditorialEs({ editor }: InfoBodyProps) {
  return (
    <>
      <p>
        Esta política describe cómo footballtrend produce, verifica y corrige lo que publica. Se aplica a todos los
        artículos, en todos los idiomas.
      </p>

      <h2>1. Fuentes</h2>
      <p>
        Solo escribimos a partir de noticias ya publicadas por medios de comunicación identificados, elegidos por el
        equipo editorial. No publicamos rumores sin fuente ni hechos que la fuente no contenga. Cada artículo indica el
        nombre de la fuente e incluye el enlace a la noticia original.
      </p>

      <h2>2. Uso de inteligencia artificial</h2>
      <p>
        Los artículos se redactan con asistencia de inteligencia artificial. Primero, los hechos de la noticia original
        (quién, qué, cuándo, cifras, declaraciones) se extraen a una ficha. Después, el artículo se escribe a partir de
        esa ficha, sin acceso al texto original, para que el resultado sea una redacción propia y no una copia
        reformulada.
      </p>

      <h2>3. Verificaciones antes de publicar</h2>
      <ul>
        <li>
          <strong>Originalidad:</strong> una comparación automática con el texto de la fuente detecta frases y
          secuencias de palabras demasiado próximas al original.
        </li>
        <li>
          <strong>Auditoría:</strong> una segunda revisión busca pasajes copiados, afirmaciones que no están en la
          fuente y artículos que siguen la estructura del original frase por frase. Los problemas encontrados se
          corrigen y el artículo se verifica de nuevo.
        </li>
        <li>
          <strong>Publicación:</strong> el equipo editorial aprueba los artículos, o define criterios según los cuales
          los artículos que han pasado todas las verificaciones se publican automáticamente. Lo que no cumple esos
          criterios queda a la espera de revisión humana. Los artículos que no pasan las verificaciones no se publican.
        </li>
      </ul>

      <h2>4. Traducciones</h2>
      <p>
        Las versiones en inglés, español y francés se traducen con inteligencia artificial a partir del artículo en
        portugués ya publicado. Cada traducción se verifica en cuanto a su fidelidad al artículo portugués y a su
        originalidad respecto a la noticia de origen, y el equipo revisa periódicamente una muestra. Cada traducción
        indica que lo es y enlaza al original en portugués.
      </p>

      <h2>5. Correcciones</h2>
      <p>
        Corregimos los errores en cuanto los confirmamos. Si encuentras uno, escribe a <Mail /> con el enlace del
        artículo. Cuando un artículo no puede corregirse, se retira.
      </p>

      <h2>6. Publicidad e independencia</h2>
      <p>
        El sitio muestra anuncios (Google AdSense) para financiar su funcionamiento. Los anunciantes no influyen en lo
        que publicamos, y no publicamos contenido patrocinado presentado como noticia.
      </p>

      <h2>7. Responsabilidad</h2>
      <p>
        footballtrend es publicado por <strong>{PUBLISHER_NAME}</strong>
        {editor ? (
          <>
            , con <strong>{editor}</strong> como editor responsable
          </>
        ) : null}
        . Contacto: <Mail />.
      </p>
    </>
  )
}

// ---------------------------------------------------------------- fr

function AboutFr({ editor }: InfoBodyProps) {
  return (
    <>
      <p>
        <strong>footballtrend</strong> est un site d’actualité football publié par <strong>{PUBLISHER_NAME}</strong>.
        Nous suivons les transferts, les résultats, les compétitions et les sélections nationales, en portugais,
        anglais, espagnol et français.
      </p>

      <h2>Notre façon de travailler</h2>
      <p>
        Chaque article part d’une information déjà publiée par un média identifié — le nom de la source et le lien
        vers l’original figurent toujours dans l’article. Nous ne faisons pas de reportage sur le terrain et ne
        publions pas de rumeurs sans source : notre travail consiste à organiser les faits, à les expliquer et à leur
        donner du contexte, avec une rédaction qui nous est propre.
      </p>
      <p>
        Les articles sont rédigés avec l’assistance de l’intelligence artificielle, selon des règles éditoriales
        définies et supervisées par notre équipe, et passent par des vérifications d’originalité et de fidélité aux
        faits avant d’être publiés. Les détails figurent dans notre{' '}
        <PageLink lang="fr" page="editorial">
          charte éditoriale
        </PageLink>
        .
      </p>

      <h2>Qui sommes-nous</h2>
      <ul>
        <li>
          Éditeur : <strong>{PUBLISHER_NAME}</strong>
        </li>
        {editor && (
          <li>
            Responsable éditorial : <strong>{editor}</strong>
          </li>
        )}
        <li>
          Contact : <Mail />
        </li>
      </ul>
    </>
  )
}

function ContactFr(_props: InfoBodyProps) {
  return (
    <>
      <p>
        Pour joindre la rédaction de footballtrend ({PUBLISHER_NAME}), écrivez à <Mail />.
      </p>

      <h2>Corrections</h2>
      <p>
        Vous avez trouvé une erreur dans un article ? Envoyez-nous le lien de l’article et ce qui est erroné. Nous la
        corrigeons dès que nous l’avons confirmée — voir la section corrections de notre{' '}
        <PageLink lang="fr" page="editorial">
          charte éditoriale
        </PageLink>
        .
      </p>

      <h2>Droits d’auteur et demandes de retrait</h2>
      <p>
        Si vous êtes titulaire de droits sur un contenu cité ou une image utilisée dans un article et souhaitez qu’il
        soit retiré, écrivez-nous avec le lien de l’article et l’identification du contenu concerné.
      </p>

      <h2>Autres sujets</h2>
      <p>Questions éditoriales, partenariats ou publicité : la même adresse.</p>
    </>
  )
}

function EditorialFr({ editor }: InfoBodyProps) {
  return (
    <>
      <p>
        Cette charte décrit comment footballtrend produit, vérifie et corrige ce qu’il publie. Elle s’applique à tous
        les articles, dans toutes les langues.
      </p>

      <h2>1. Sources</h2>
      <p>
        Nous n’écrivons qu’à partir d’informations déjà publiées par des médias identifiés, choisis par l’équipe
        éditoriale. Nous ne publions ni rumeurs sans source ni faits que la source ne contient pas. Chaque article
        indique le nom de la source et inclut le lien vers l’information originale.
      </p>

      <h2>2. Utilisation de l’intelligence artificielle</h2>
      <p>
        Les articles sont rédigés avec l’assistance de l’intelligence artificielle. D’abord, les faits de
        l’information originale (qui, quoi, quand, chiffres, déclarations) sont extraits dans une fiche. L’article est
        ensuite écrit à partir de cette fiche, sans accès au texte original — afin que le résultat soit une rédaction
        propre et non une copie reformulée.
      </p>

      <h2>3. Vérifications avant publication</h2>
      <ul>
        <li>
          <strong>Originalité :</strong> une comparaison automatique avec le texte de la source détecte les phrases et
          les suites de mots trop proches de l’original.
        </li>
        <li>
          <strong>Audit :</strong> une seconde relecture recherche les passages copiés, les affirmations absentes de la
          source et les articles qui suivent la structure de l’original phrase par phrase. Les problèmes détectés sont
          corrigés et l’article est vérifié à nouveau.
        </li>
        <li>
          <strong>Publication :</strong> l’équipe éditoriale approuve les articles, ou définit des critères selon
          lesquels les articles ayant passé toutes les vérifications sont publiés automatiquement. Ce qui ne remplit pas
          ces critères attend une relecture humaine. Les articles qui ne passent pas les vérifications ne sont pas
          publiés.
        </li>
      </ul>

      <h2>4. Traductions</h2>
      <p>
        Les versions anglaise, espagnole et française sont traduites avec l’intelligence artificielle à partir de
        l’article en portugais déjà publié. Chaque traduction est vérifiée quant à sa fidélité à l’article portugais et
        quant à son originalité par rapport à l’information d’origine, et l’équipe relit régulièrement un échantillon.
        Chaque traduction indique qu’elle en est une et renvoie à l’original en portugais.
      </p>

      <h2>5. Corrections</h2>
      <p>
        Nous corrigeons les erreurs dès que nous les confirmons. Si vous en trouvez une, écrivez à <Mail /> avec le
        lien de l’article. Lorsqu’un article ne peut pas être corrigé, il est retiré.
      </p>

      <h2>6. Publicité et indépendance</h2>
      <p>
        Le site affiche des publicités (Google AdSense) pour financer son fonctionnement. Les annonceurs n’influencent
        pas ce que nous publions, et nous ne publions pas de contenu sponsorisé présenté comme de l’information.
      </p>

      <h2>7. Responsabilité</h2>
      <p>
        footballtrend est publié par <strong>{PUBLISHER_NAME}</strong>
        {editor ? (
          <>
            , avec <strong>{editor}</strong> comme responsable éditorial
          </>
        ) : null}
        . Contact : <Mail />.
      </p>
    </>
  )
}

export const INFO_PAGES: Record<InfoPageKey, Record<Lang, InfoPageContent>> = {
  about: {
    pt: {
      title: 'Sobre o footballtrend',
      description: `Quem publica o footballtrend (${PUBLISHER_NAME}), como os artigos são produzidos e como nos contactar.`,
      Body: AboutPt,
    },
    en: {
      title: 'About footballtrend',
      description: `Who publishes footballtrend (${PUBLISHER_NAME}), how the articles are produced and how to contact us.`,
      Body: AboutEn,
    },
    es: {
      title: 'Sobre footballtrend',
      description: `Quién publica footballtrend (${PUBLISHER_NAME}), cómo se producen los artículos y cómo contactarnos.`,
      Body: AboutEs,
    },
    fr: {
      title: 'À propos de footballtrend',
      description: `Qui publie footballtrend (${PUBLISHER_NAME}), comment les articles sont produits et comment nous contacter.`,
      Body: AboutFr,
    },
  },
  contact: {
    pt: {
      title: 'Contacto',
      description: 'Como contactar a redação do footballtrend: correções, direitos de autor e outros assuntos.',
      Body: ContactPt,
    },
    en: {
      title: 'Contact',
      description: 'How to contact the footballtrend newsroom: corrections, copyright and other matters.',
      Body: ContactEn,
    },
    es: {
      title: 'Contacto',
      description: 'Cómo contactar con la redacción de footballtrend: correcciones, derechos de autor y otros asuntos.',
      Body: ContactEs,
    },
    fr: {
      title: 'Contact',
      description: 'Comment contacter la rédaction de footballtrend : corrections, droits d’auteur et autres sujets.',
      Body: ContactFr,
    },
  },
  editorial: {
    pt: {
      title: 'Política editorial',
      description: 'Como o footballtrend escolhe fontes, usa inteligência artificial, verifica, traduz e corrige o que publica.',
      Body: EditorialPt,
    },
    en: {
      title: 'Editorial policy',
      description: 'How footballtrend chooses sources, uses artificial intelligence, and checks, translates and corrects what it publishes.',
      Body: EditorialEn,
    },
    es: {
      title: 'Política editorial',
      description: 'Cómo footballtrend elige sus fuentes, usa inteligencia artificial y verifica, traduce y corrige lo que publica.',
      Body: EditorialEs,
    },
    fr: {
      title: 'Charte éditoriale',
      description: 'Comment footballtrend choisit ses sources, utilise l’intelligence artificielle, vérifie, traduit et corrige ce qu’il publie.',
      Body: EditorialFr,
    },
  },
}
