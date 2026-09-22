# PRD — Máquina de Conteúdo

## 1. Objetivo

Reduzir a ~90% o esforço manual de produzir e publicar notícias de **futebol** no
próprio site, mantendo um humano no portão de decisão para garantir qualidade,
fidelidade ao que foi realmente publicado e conformidade com as políticas das
plataformas (Google, sobretudo) e com direitos de autor.

O sistema não é "lights-out". É uma linha de montagem que prepara tudo e para à espera
de aprovação. O trabalho pesado é automático; o julgamento editorial é humano e rápido.

## 2. Utilizadores

- **Operador/editor** (o dono do sistema): revê e aprova/rejeita artigos no dashboard
  (confirmando que a reescrita é fiel ao artigo original, com o link à mão para
  verificar), configura as fontes RSS de notícias de futebol.
- **Sistema** (backend FastAPI): deteta artigos novos nas fontes configuradas, pontua,
  e gera a reescrita para revisão.
- **Leitor**: visita o site público (`/`, `/artigo/:slug`) e lê as notícias publicadas,
  sempre com a fonte original creditada e ligada. Não precisa de conta.

## 3. Âmbito

### Dentro

- Deteção de notícias de futebol a partir de **feeds RSS que o operador configura**
  (nunca pesquisa aberta na internet — só fontes explicitamente escolhidas).
- Pontuação e filtragem por relevância ao futebol.
- Geração de **artigo**: uma **reescrita própria** (paráfrase fiel, nunca cópia
  literal) de uma notícia real encontrada numa fonte configurada — nunca uma peça
  inventada a partir de dados soltos.
- Atribuição à fonte original **sempre visível** (nome + link), tanto no cartão de
  revisão do operador como no artigo publicado.
- Portão de revisão no dashboard (aprovar/rejeitar/editar). **Aprovar É publicar** —
  não há CMS externo nem passo de publicação separado.
- Site público de notícias, servido pelo próprio `apps/web`.

### Fora (por design, não "para depois")

- Qualquer nicho que não seja futebol.
- Qualquer formato que não seja artigo de texto: Shorts/vídeo, posts sociais.
- Qualquer destino de publicação externo: WordPress, YouTube, X, Instagram, LinkedIn.
- Pesquisa aberta na internet como fonte — só feeds RSS explicitamente configurados.
- Republicação literal/quase literal de artigos de terceiros (risco de direitos de
  autor e da política do Google contra "scraped content" — ver §6).
- Autonomia total sem aprovação humana (proibido por design — ver §5).
- Compra/gestão de tráfego pago. App móvel nativa (o dashboard responsivo chega).

## 4. Critérios de sucesso

- Um artigo novo numa fonte configurada chega a "rascunho pronto para revisão" sem
  intervenção manual.
- O operador consegue verificar a fidelidade da reescrita ao artigo original (link
  sempre visível no cartão de revisão) e aprova/rejeita em poucos segundos.
- Um artigo aprovado aparece no site (`/artigo/:slug`) imediatamente, com a fonte
  original creditada e ligada.
- Zero publicações sem aprovação. Zero informação inventada — toda a reescrita é
  rastreável a um artigo real gravado em `sport_facts`.

## 5. Princípio central: humano no portão (e porquê)

**Compliance não é opcional; é o que decide se o projeto sobrevive.**

- **Google — scaled content abuse:** a política é agnóstica ao método; o que penaliza é
  gerar muitas páginas para manipular rankings, com pouco ou nenhum valor. O perfil
  penalizado é exatamente "muitos artigos de IA por dia, sem revisão editorial, com
  profundidade fina". Sinais de E-E-A-T (autor identificado, dados originais, experiência)
  não se fabricam à velocidade de fábrica.
- **Direitos de autor:** reescrever nas próprias palavras + creditar/ligar a fonte é a
  linha vermelha que separa "agregador editorial" de "cópia não autorizada". O sistema
  não tem margem para "esquecer" a atribuição — por isso ela é gravada de forma
  estruturada (`content_items.metadata.source_url`), nunca deixada ao critério do LLM
  escrevê-la no corpo do texto.

Consequência de design:

1. Todo o conteúdo gerado nasce em `pending_review`.
2. Nada é publicado sem uma ação de aprovação humana registada em `audit_log` — imposto
   na base de dados (`enforce_review_gate`), não só na aplicação.
3. O gerador varia a estrutura (vocabulário fechado de 7 variações,
   `docs/publicador/EDITORIAL.md` §4), e cada artigo tem autoria transparente
   atribuída (nunca uma pessoa fictícia — `docs/publicador/AUTHORS.md` §1).
4. A informação vem sempre de um artigo real publicado por uma fonte configurada,
   nunca inventada. Desde `docs/publicador/`, isto deixou de ser só uma instrução ao
   modelo: quem escreve o artigo **nunca recebe a prosa da fonte**, só uma ficha de
   factos telegráfica (P1) — e um portão determinístico (`originality.py`, sem LLM)
   mede a semelhança com o original antes de qualquer humano ver o rascunho. A
   atribuição à fonte é sempre gravada e mostrada, tanto no dashboard (para o
   operador verificar antes de aprovar) como no artigo publicado.

## 6. Riscos e mitigações

- **Paráfrase demasiado próxima do original (risco de direitos de autor)** → mitigado
  em três camadas independentes, não só por instrução: (1) estrutural — `write_article`
  nunca recebe o texto original, só a ficha de factos; (2) determinístico — portão de
  originalidade (`docs/publicador/ORIGINALITY.md`) mede sobreposição por n-gramas antes
  de criar o rascunho; (3) humano — o cartão de revisão mostra o distintivo de
  originalidade e o link ao artigo original para o operador comparar antes de aprovar
  (`apps/web/src/pages/ReviewQueue.tsx`).
- **Conteúdo insuficiente/fino aos olhos do Google** → porta de qualidade em P1
  (`densidade == 'baixa'` ou poucos factos → não gera artigo) e limiar de
  `word_count` no portão de originalidade (`docs/publicador/ORIGINALITY.md` §2).
- **Fonte indisponível ou artigo ilegível** → a extração falha em vez de inventar
  conteúdo (`apps/api/app/services/source_article.py`); o topic volta a
  `approved_for_gen` para nova tentativa (até `MAX_GENERATE_ATTEMPTS`).
- **Feed RSS de baixa qualidade ou fora de tópico** → a curadoria acontece na escolha
  da fonte (o operador só configura feeds de futebol fidedignos), não em pesquisa
  aberta.
