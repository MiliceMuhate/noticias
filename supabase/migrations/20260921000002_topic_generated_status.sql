-- ============================================================================
-- Estado terminal 'generated' para topics: hoje um topic ficava preso em
-- 'processing' para sempre depois de gerar com sucesso (só saía de 'processing'
-- em caso de falha, devolvido a 'approved_for_gen'). Sem estado terminal de
-- sucesso, o painel (Trends.tsx) não tinha como mostrar "artigo gerado" —
-- ficava silencioso mesmo depois do processo terminar.
-- ============================================================================

alter type topic_status add value if not exists 'generated';
