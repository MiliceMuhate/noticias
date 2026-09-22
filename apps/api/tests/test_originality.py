"""
Os 8 casos obrigatórios de docs/publicador/ORIGINALITY.md §4. Texto de futebol real
(não lorem ipsum) — o gate mede propriedades linguísticas.
"""

from __future__ import annotations

from app.services.originality import check, tokens

THRESHOLDS = {
    "longest_common_run": {"pass": 7, "block": 11},
    "containment_5": {"pass": 0.04, "block": 0.09},
    "jaccard_5": {"pass": 0.06, "block": 0.12},
    "sentence_overlap": {"pass": 0.10, "block": 0.20},
    "title_overlap": {"pass": 0.50, "block": 0.65},
    "self_similarity": {"pass": 0.06, "block": 0.12},
    "word_count": {"pass": 600, "block": 500},
}

SOURCE_TITLE = "FC Porto vence Sporting por 2-1 em jogo decisivo para o título"

SOURCE_TEXT = """O FC Porto venceu o Sporting por 2-1, este domingo, no Estádio do Dragão, num jogo
decisivo para a luta pelo título da Liga Portuguesa. Os golos da equipa da casa foram
marcados por Pepê, aos 23 minutos, e por Evanilson, aos 67 minutos. O Sporting reduziu
a diferença através de Gyökeres, aos 81 minutos, mas não foi suficiente para evitar a
derrota.

Com este resultado, o FC Porto sobe provisoriamente ao primeiro lugar da classificação,
com 58 pontos, mais um do que o Sporting, que tinha entrado para a partida na
liderança. O Benfica, terceiro classificado, soma 55 pontos e ainda tem um jogo em
atraso.

O treinador do FC Porto, Sérgio Conceição, elogiou a exibição da equipa após o jogo:
"Fizemos um jogo muito inteligente, sofremos quando tivemos de sofrer e fomos eficazes
nos momentos certos, e isso faz toda a diferença no fim de uma época longa e difícil."

Do lado do Sporting, o técnico Rúben Amorim lamentou a exibição da sua equipa na
primeira parte: "Entrámos mal no jogo e isso custou-nos caro. Na segunda parte fomos
melhores, mas o resultado já estava condicionado por essa primeira parte fraca que
fizemos frente a um adversário direto no campeonato."

O FC Porto tinha vencido apenas um dos últimos cinco jogos diretos frente ao Sporting,
um jejum que agora termina em fase decisiva da época. A equipa de Sérgio Conceição
volta a jogar já na quarta-feira, na Liga dos Campeões da UEFA, frente ao Arsenal, em
Inglaterra. O Sporting recebe o Famalicão no próximo fim de semana, na Liga Portuguesa.

Gyökeres chegou aos 28 golos na época, mantendo-se como o melhor marcador do campeonato,
apesar da derrota da sua equipa. Pepê, por seu lado, chegou aos 9 golos na Liga
Portuguesa esta temporada, naquele que foi o seu primeiro golo em quatro jogos.

A arbitragem do encontro, a cargo de Artur Soares Dias, foi pouco polémica, com apenas
quatro cartões amarelos mostrados ao longo dos noventa minutos, dois para cada equipa.
Não houve lances de vídeo-árbitro significativos durante a partida.

A próxima jornada da Liga Portuguesa está marcada para o fim de semana de 12 e 13 de
abril, com o Benfica a tentar aproveitar o desaire do Sporting para se aproximar do
topo da classificação nacional."""

AUTHORIZED_QUOTE = (
    "Fizemos um jogo muito inteligente, sofremos quando tivemos de sofrer e fomos eficazes "
    "nos momentos certos, e isso faz toda a diferença no fim de uma época longa e difícil."
)

UNAUTHORIZED_QUOTE = (
    "Entrámos mal no jogo e isso custou-nos caro. Na segunda parte fomos melhores, mas o "
    "resultado já estava condicionado por essa primeira parte fraca que fizemos frente a "
    "um adversário direto no campeonato."
)

ENTITY_NAMES = [
    "FC Porto", "Sporting", "Benfica", "Arsenal", "Famalicão",
    "Pepê", "Evanilson", "Gyökeres", "Sérgio Conceição", "Rúben Amorim", "Artur Soares Dias",
]
DOMAIN_PHRASES = ["liga dos campeoes da uefa", "liga portuguesa", "cartao amarelo"]


def _entities() -> set[str]:
    ents: set[str] = set()
    for name in ENTITY_NAMES:
        ents.update(tokens(name))
    for phrase in DOMAIN_PHRASES:
        ents.update(tokens(phrase))
    return ents


# Artigo legítimo (independente): mesmos factos, palavras e estrutura próprias,
# >= 600 palavras, com as três secções obrigatórias.
INDEPENDENT_BODY = """## O que aconteceu

Num duelo direto pelo título, o FC Porto levou a melhor sobre o Sporting, triunfando
por 2-1 no Dragão. A turma azul-e-branca adiantou-se ainda na primeira parte, por
intermédio de Pepê, e ampliou a vantagem já na etapa complementar, com Evanilson a
fazer o segundo. O Sporting ainda respondeu, perto do final, através de Gyökeres, mas
o resultado já não se alterou até ao apito final.

Este triunfo coloca, para já, os dragões na frente da tabela classificativa: são 58 os
pontos somados pela equipa até este momento da temporada, um total que ninguém supera
nesta fase da prova. Segue-se o Benfica, ainda com uma partida por realizar, naquele
que promete ser um desfecho de campeonato particularmente renhido.

A contenda ficou também marcada pela arbitragem discreta de Artur Soares Dias, que
mostrou apenas quatro cartões amarelos, dois para cada lado, num jogo sem grandes
motivos de contestação nem recurso relevante ao vídeo-árbitro.

Este foi apenas o segundo triunfo dos dragões nos últimos cinco confrontos diretos com
os leões, um registo que a equipa comandada por Sérgio Conceição queria mesmo inverter
nesta fase da temporada, tão importante para as contas do campeonato português.

## Porque é que isto importa

Este resultado altera de forma significativa o desenho da fase final do campeonato.
Ocupar o topo da tabela a esta altura da época, mesmo que de forma provisória, traz
uma vantagem psicológica clara: passa a ser o adversário direto a correr atrás do
prejuízo, depois de ter marcado o ritmo da competição durante boa parte da temporada.

Para o Benfica, o resultado também é relevante, ainda que de forma indireta: com um
jogo em atraso por disputar, os encarnados sabem que uma vitória nesse encontro os
pode colocar bem perto do topo, mantendo viva a corrida a três nomes até às últimas
jornadas do calendário.

A distância curta entre os três primeiros classificados sugere uma reta final de
campeonato particularmente equilibrada, em que cada detalhe — lesões, calendário,
mercado ainda por fechar, arbitragens polémicas — pode pesar de forma desproporcionada
no resultado final da corrida ao título nacional.

Historicamente, equipas que lideram a tabela a esta altura da época acabam por
confirmar o título em mais de dois terços dos casos nas últimas duas décadas de
campeonato português, um dado que reforça a importância simbólica do resultado deste
fim de semana, ainda que esteja longe de garantir seja o que for de concreto.

## O que vem a seguir

O calendário não dá tréguas a nenhuma das equipas envolvidas nesta luta pelo título.
Segue-se, a meio da semana, um compromisso europeu relevante, contra adversário inglês,
numa fase a eliminar de uma competição continental que obriga a uma gestão cuidadosa
do desgaste físico dos jogadores mais utilizados nos últimos encontros.

Já no campeonato interno, o próximo capítulo chega já no fim de semana seguinte, com um
adversário do meio da tabela pela frente — um compromisso que, ao contrário do que o
calendário poderia sugerir, ninguém encara como uma formalidade fácil de resolver.

A expectativa em redor da ronda seguinte deverá ser elevada, sobretudo pelo facto de o
terceiro classificado entrar em campo já a saber a que distância exata do topo pode
ficar, consoante o resultado que conseguir alcançar no seu compromisso em atraso, ainda
por marcar oficialmente no calendário da competição nacional de clubes.

Analistas do campeonato têm vindo a notar que, nas últimas épocas, a diferença entre
conquistar ou falhar o título raramente se decide numa única jornada isolada, mas sim
na capacidade de cada candidato manter uma série longa de resultados positivos, sem
tropeços em jogos considerados, à partida, mais acessíveis no papel. É precisamente
essa consistência ao longo de várias semanas seguidas que separa, ano após ano, quem
efetivamente levanta o troféu no final da temporada de quem apenas lidera tabelas
provisórias durante uma parte do campeonato, sem nunca chegar a confirmar essa posição
quando mais importa, já perto do desfecho da competição."""


def test_1_copia_integral_bloqueia():
    r = check(
        SOURCE_TEXT,
        SOURCE_TEXT,
        SOURCE_TITLE,
        entities=set(),
        allowed_quotes=[],
        recent_bodies=[],
        thresholds=THRESHOLDS,
    )
    assert r.verdict == "block"
    assert r.containment_5 > 0.9


def test_2_parafrase_por_sinonimos_pelo_menos_review():
    paraphrase = (
        "O FC Porto bateu o Sporting por 2-1, neste domingo, no Estádio do Dragão, "
        "num jogo importante para a corrida pelo título da Liga Portuguesa. Os golos "
        "da equipa da casa foram apontados por Pepê, aos 23 minutos, e por Evanilson, "
        "aos 67 minutos. O Sporting encurtou a diferença através de Gyökeres, aos 81 "
        "minutos, mas isso não chegou para evitar a derrota.\n\n"
        "Com este resultado, o FC Porto passa provisoriamente para o primeiro lugar "
        "da tabela, com 58 pontos, mais um do que o Sporting, que tinha chegado à "
        "partida na liderança. O Benfica, terceiro colocado, tem 55 pontos e ainda "
        "tem um jogo em atraso."
    )
    r = check(
        paraphrase,
        SOURCE_TEXT,
        SOURCE_TITLE,
        entities=_entities(),
        allowed_quotes=[],
        recent_bodies=[],
        thresholds=THRESHOLDS,
    )
    assert r.verdict in ("review", "block")
    assert r.sentence_overlap >= THRESHOLDS["sentence_overlap"]["pass"]


def test_3_artigo_legitimo_passa():
    r = check(
        INDEPENDENT_BODY,
        SOURCE_TEXT,
        SOURCE_TITLE,
        entities=_entities(),
        allowed_quotes=[],
        recent_bodies=[],
        thresholds=THRESHOLDS,
    )
    assert r.verdict == "pass", r.reasons


def test_4_citacao_autorizada_nao_conta():
    body = INDEPENDENT_BODY + f'\n\nSérgio Conceição resumiu assim: "{AUTHORIZED_QUOTE}"'
    r = check(
        body,
        SOURCE_TEXT,
        SOURCE_TITLE,
        entities=_entities(),
        allowed_quotes=[AUTHORIZED_QUOTE],
        recent_bodies=[],
        thresholds=THRESHOLDS,
    )
    assert r.verdict == "pass", r.reasons
    assert r.unauthorized_quotes == []


def test_5_citacao_nao_autorizada_da_review():
    body = INDEPENDENT_BODY + f'\n\nRúben Amorim comentou: "{UNAUTHORIZED_QUOTE}"'
    r = check(
        body,
        SOURCE_TEXT,
        SOURCE_TITLE,
        entities=_entities(),
        allowed_quotes=[],  # não autorizada de propósito
        recent_bodies=[],
        thresholds=THRESHOLDS,
    )
    assert UNAUTHORIZED_QUOTE.strip() in [q.strip() for q in r.unauthorized_quotes]
    assert r.verdict in ("review", "block")


def test_6_self_similarity_alta_entre_dois_artigos_nossos():
    r = check(
        INDEPENDENT_BODY,
        SOURCE_TEXT,
        SOURCE_TITLE,
        entities=_entities(),
        allowed_quotes=[],
        recent_bodies=[INDEPENDENT_BODY],  # "outro" artigo nosso quase igual
        thresholds=THRESHOLDS,
    )
    assert r.self_similarity > THRESHOLDS["self_similarity"]["pass"]
    assert r.verdict in ("review", "block")


def test_7_entidades_nao_disparam_longest_common_run():
    body_com_entidades = INDEPENDENT_BODY.replace(
        "## O que vem a seguir",
        "## O que vem a seguir\n\nA Liga dos Campeões da UEFA volta a estar em cima da mesa.",
    )
    r = check(
        body_com_entidades,
        SOURCE_TEXT,
        SOURCE_TITLE,
        entities=_entities(),
        allowed_quotes=[],
        recent_bodies=[],
        thresholds=THRESHOLDS,
    )
    assert r.longest_common_run <= THRESHOLDS["longest_common_run"]["pass"]


def test_8_estrutura_em_falta_bloqueia():
    body_sem_estrutura = INDEPENDENT_BODY.replace("## O que vem a seguir", "## Mais sobre o assunto")
    r = check(
        body_sem_estrutura,
        SOURCE_TEXT,
        SOURCE_TITLE,
        entities=_entities(),
        allowed_quotes=[],
        recent_bodies=[],
        thresholds=THRESHOLDS,
    )
    assert r.structure_ok is False
    assert r.verdict == "block"
