-- ============================================================================
-- Motivo das notícias recusadas/falhadas + pedido de revisão (docs/TASKS.md).
--
-- rejection_category — chave estável para agrupar ("rever todas as negadas
--   com este motivo"): pontuacao, nao_futebol, sem_conteudo, inviavel,
--   duplicado, ia_sem_saldo, resposta_cortada, fonte_inacessivel,
--   originalidade, auditoria, estrutura, erro_tecnico.
-- rejection_reason   — explicação em português para o operador. Quando foi a
--   IA a recusar (redação, P1/P2), é a explicação que a própria IA deu.
-- review_requested_at — quando um operador pediu revisão: as tentativas de
--   geração passam a contar a partir daqui (senão uma notícia que já falhou 3
--   vezes só teria mais uma).
-- ============================================================================

alter table public.topics
  add column if not exists rejection_category text,
  add column if not exists rejection_reason text,
  add column if not exists review_requested_at timestamptz;

create index if not exists topics_rejection_category_idx
  on public.topics (rejection_category)
  where status in ('rejected', 'failed') and archived_at is null;
