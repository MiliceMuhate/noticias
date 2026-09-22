# Bola na Área — Ecrã de Notícias
Especificação de design · v1 · 21 Set 2026

## 1. Problema

O ecrã atual (`localhost:5173`) usa fundo verde-escuro saturado, cartões sem imagem e
títulos em verde sobre verde. Resultado: parece uma app de dashboard, não um site
informativo — pouca hierarquia, zero apoio visual (fotos), contraste cansativo em
leitura longa.

## 2. Objectivos

1. Aparência convencional de portal de notícias (fundo claro, coluna de leitura clara).
2. Imagens como parte da estrutura, não decoração.
3. Cor intensa apenas em rótulos, links e filetes — nunca em fundos grandes.
4. Hierarquia óbvia: manchete > últimas > lista/arquivo.

## 3. Fundações visuais (Delvis Design System)

**Tipografia**
| Uso | Fonte | Peso / tamanho |
|---|---|---|
| Marca / navegação / rótulos de secção | Oswald | 600–700, CAIXA ALTA, letter-spacing .06–.1em |
| Títulos de notícia | Oswald | 500–600, **caixa de frase** (desvio justificado: manchetes em caixa alta são ilegíveis) |
| Corpo, lead, metadados | Quicksand | 500–700, 12–17px |

Escala de títulos: manchete 40–46px · destaque 30px · lista 20–24px · cartão 21px.

**Cor** (tokens `colors_and_type.css`)
| Papel | Valor | Token |
|---|---|---|
| Texto principal | `#09414e` | `--delvis-ink` / `--fg1` |
| Corpo de texto | `#3f5b63` | derivado de `--fg1` |
| Metadados / legendas | `#5d7b82` | `--delvis-mute` / `--fg2` (mínimo 4.5:1) |
| Rótulo de categoria, links, botões | `#0d6a7c` | `--delvis-teal` |
| Ênfase "ao minuto" | `#1898bf` | `--delvis-cyan` |
| Superfície | `#ffffff` | `--bg-card` |
| Superfície secundária / caixas | `#f7fafa` | próximo de `--delvis-surface` |
| Filetes | `#e3e8ea` / `#eef2f3` | próximo de `--delvis-line` |
| Barra superior escura (só 1c) | `#09414e` | `--delvis-ink` |

Regra: **nenhum fundo teal com mais de 15% da altura do ecrã.**

**Forma e espaço**
- Cantos: imagens e cartões a 0–10px (o pill da marca fica reservado a chips/filtros — um
  portal de notícias com tudo arredondado perde o tom informativo).
- Espaçamento pela escala `--sp-*`: gutter 28–44px, padding de página 32–56px.
- Sombra: apenas a moldura do próprio cartão; conteúdo é separado por filetes, não por sombras.
- Hover: teal um passo mais claro (`--delvis-teal-600`), sublinhado no título.

## 4. As três direções

### 1a — Portal clássico (recomendada para desktop)
Cabeçalho de duas linhas (marca + pesquisa + data / navegação com aba ativa preenchida).
Manchete: foto 3:2 grande + kicker, título 40px, lead, autor. À direita, coluna "Últimas"
com hora à esquerda (rail de 42px). Abaixo, "Mais notícias" em grelha de 3 com miniatura 16:9.
Melhor para: muita notícia por dia, leitor que varre.

### 1b — Editorial
Masthead centrado entre filetes + linha de data; navegação por competições com filete duplo.
Manchete acima da foto, legenda de foto com filete lateral, texto em duas colunas.
Rail: "Em destaque" numerado 01–05 (numerais em `--delvis-teal-mid`) + boletim diário.
Lista "Todas as notícias" em linhas de 200px de foto + texto + data.
Melhor para: autoridade e leitura de artigo; menos denso.

### 1c — Feed compacto
Barra escura fina + chips de filtro (único lugar com pill da marca). Coluna única
agrupada por dia (Hoje / Ontem), miniaturas 150×100 à direita, rail com tabela do
Moçambola, tópicos e redes. É a direção que converte melhor para telemóvel (o rail
passa para o fim da página).

## 5. Imagens

- Manchete 3:2 (mín. 1200×800), cartão 16:9, miniatura de lista 3:2 (mín. 450×300).
- Sempre foto real de jogo/treino; sem texto sobre a foto.
- Legenda obrigatória na manchete: descrição + `Foto: fonte`.
- Fallback quando não há foto: bloco `#f2f5f6` com o rótulo da categoria — nunca esticar
  logótipos nem usar imagens genéricas.
- No mockup as caixas cinzentas são espaços de imagem: arrasta um ficheiro para preencher.

## 6. Acessibilidade

- Contraste mínimo 4.5:1 para texto informativo (por isso metadados a `#5d7b82`, não mais claro).
- Título de notícia é o link; área de toque ≥44px em telemóvel.
- Data legível por extenso no cabeçalho; hora relativa ("há 2 horas") sempre acompanhada de hora absoluta na lista.

## 7. Conteúdo / voz

Português de Moçambique, factual e curto. Kicker = competição ou região
(MOÇAMBOLA, PREMIER LEAGUE, SELECÇÕES, CHAMPIONS). Lead de 1–2 frases que acrescentam
informação ao título, sem "Veja o que aconteceu". Assinatura sempre `Autor · data`.

## 8. Próximos passos

1. Escolher direção (ou combinação) para desenvolver.
2. Versão telemóvel do escolhido (375px).
3. Página de artigo aberto + página de categoria.
4. Estados: sem imagem, notícia de última hora, lista vazia, carregamento.

Ficheiros: `Bola na Área - Notícias.dc.html` (mockups 1a/1b/1c) ·
`Bola na Area - Noticias (standalone).html` (versão offline).
