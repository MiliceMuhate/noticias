/**
 * Tipos partilhados por `apps/web` (ver docs/ARCHITECTURE.md).
 * NewsSource/fetch_source_article vivem agora só no backend (apps/api, Python) — já
 * não há Publisher: publicar é o próprio ato de aprovar (ver DATA_MODEL.md).
 */

export interface ScoringWeights {
  relevance: number
  momentum: number
  volume: number
}

export interface AutoApproveGen {
  enabled: boolean
  auto_threshold: number
}
