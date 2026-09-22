-- ============================================================================
-- Estado terminal 'failed' para topics: hoje, ao esgotar as tentativas, o
-- topic ficava preso em 'processing' para sempre — indistinguível de "a gerar
-- agora mesmo" — sem nenhum sinal visível de falha nem forma de repetir. O
-- mesmo acontecia se o backend reiniciasse a meio de uma geração (o `processing`
-- ficava órfão). Ver apps/api/app/scheduler.py (recover_stuck_topics,
-- exhausted attempts) e apps/web/src/pages/Trends.tsx (botão "Tentar novamente").
-- ============================================================================

alter type topic_status add value if not exists 'failed';
