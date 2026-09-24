-- ============================================================================
-- Trava de segurança contra artigos duplicados: nunca dois content_items
-- ativos (pending_review/published) para a mesma fonte real. O grosso da
-- proteção é em Python (generate_article verifica antes de gastar LLM,
-- _generate_one reclama o topic com compare-and-swap antes de gerar) — este
-- índice cobre a janela residual entre dois TOPICS diferentes da mesma
-- notícia (RSS relistada com título ligeiramente diferente) gerados em
-- paralelo. Sem esta janela, dois processos podiam passar ambos o
-- verificação em Python (nenhum tinha ainda inserido) e duplicar na mesma.
-- ============================================================================

create unique index if not exists content_items_active_source_url_uniq
  on public.content_items ((metadata ->> 'source_url'))
  where status in ('pending_review', 'published');
