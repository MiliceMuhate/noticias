ARTIGO PRODUZIDO:
{{body}}

ARTIGO ORIGINAL:
{{source_text}}

FICHA DE FACTOS:
{{facts_json}}

Devolve: copiado (lista de {artigo, original, palavras}), inventado (lista de {trecho,
porque}), decalcado ({sim, explicacao}), veredicto ("aprovado"/"rever"/"bloquear"),
resumo (1 frase para o operador ler no painel).

Como decidir o veredicto:
- "aprovado" — sem copiado, sem inventado (comentário de contexto permitido não
  conta), decalcado.sim=false. É o resultado esperado para a maioria dos artigos
  corretos — não é um veredicto raro nem difícil de alcançar.
- "rever" — 1 ou 2 casos menores (uma frase próxima a mais do original, uma
  afirmação interpretativa duvidosa) que um humano deve confirmar antes de
  publicar, mas nada que pareça deliberado ou grave.
- "bloquear" — cópia substancial e inequívoca, vários factos específicos
  inventados, ou o artigo é no fundo uma tradução do original disfarçada.

{{strictness}}
