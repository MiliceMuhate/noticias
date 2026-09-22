-- ============================================================================
-- Seed de desenvolvimento: settings por omissão + uma fonte de exemplo.
-- Corre automaticamente com `supabase db reset`.
-- ============================================================================

insert into public.settings (key, value) values
  -- pesos do score = relevance*w1 + momentum*w2 + volume*w3 (normalizados 0..1)
  ('scoring_weights', '{"relevance": 0.4, "momentum": 0.35, "volume": 0.25}'::jsonb),
  -- score mínimo para um topic passar a 'scored' relevante (abaixo → 'rejected')
  ('score_threshold', '{"min_score": 0.45}'::jsonb),
  -- se true, topics com score >= auto_threshold passam logo a approved_for_gen
  ('auto_approve_gen', '{"enabled": true, "auto_threshold": 0.65}'::jsonb),

  -- autoria transparente, não pessoas fictícias (docs/publicador/AUTHORS.md §1).
  -- As quatro editorias (desks) vêm de AUTHORS.md §2.
  ('authors', '{
     "byline": "Redação Bola na Área",
     "editor": "Muhate",
     "ai_assisted": true,
     "desks": {
       "resultados": {"beat": "Jogos e classificações", "voice": "rápida, factual, cronológica. Frases curtas. O resultado no lead, sempre."},
       "transferencias": {"beat": "Mercado", "voice": "cautelosa e explícita sobre o grau de confirmação — distingue sempre acordado, em negociação e noticiado por."},
       "analise": {"beat": "Contexto e leitura", "voice": "mais pausada, com parágrafos ligeiramente maiores, argumenta a partir dos factos da ficha."},
       "institucional": {"beat": "Clubes, federações, regulamentos", "voice": "sóbria, quase administrativa. Cita documentos e comunicados pelo nome."}
     }
   }'::jsonb),

  -- voz editorial global (docs/publicador/EDITORIAL.md §2) + lista de clichés banidos
  ('editorial_voice', '{
     "variant": "pt-PT",
     "person": "terceira",
     "register": "jornalístico informado, sem solenidade",
     "sentence_target_words": 18,
     "paragraph_max_sentences": 3,
     "cliche_blacklist": [
       "numa reviravolta", "vale a pena notar", "não é segredo que", "no mundo do futebol",
       "sem sombra de dúvidas", "deu que falar", "fez história", "o astro", "o craque maior",
       "eis o que sabemos", "confira", "saiba mais", "fique atento", "prepare-se",
       "o cenário é claro", "resta saber", "uma coisa é certa", "mexeu com as redes sociais",
       "bombou", "a internet não perdoou", "um golo que vale mais do que três pontos"
     ]
   }'::jsonb),

  -- limiares do portão de originalidade (docs/publicador/ORIGINALITY.md §2) —
  -- ponto de partida, não verdade absoluta; calibrar com scripts/calibrate_originality.py
  -- depois dos primeiros ~20 artigos.
  ('originality_thresholds', '{
     "longest_common_run": {"pass": 7, "block": 11},
     "containment_5": {"pass": 0.04, "block": 0.09},
     "jaccard_5": {"pass": 0.06, "block": 0.12},
     "sentence_overlap": {"pass": 0.10, "block": 0.20},
     "title_overlap": {"pass": 0.50, "block": 0.65},
     "self_similarity": {"pass": 0.06, "block": 0.12},
     "word_count": {"pass": 600, "block": 500}
   }'::jsonb),

  -- modelo por passo (docs/publicador/PROMPTS.md) — todos no mesmo modelo já
  -- configurado no .env; ajusta por passo assim que confirmares que a workspace
  -- AWS tem acesso a outros modelos (sonnet-5/opus-5).
  ('model_by_step', '{
     "extract_facts": "claude-haiku-4-5",
     "editorial_brief": "claude-haiku-4-5",
     "write_article": "claude-haiku-4-5",
     "package": "claude-haiku-4-5",
     "self_audit": "claude-haiku-4-5",
     "rewrite_flagged": "claude-haiku-4-5"
   }'::jsonb),

  -- vocabulário fechado de tags (docs/publicador/EDITORIAL.md §7) — o gerador
  -- nunca inventa tags fora desta lista
  ('controlled_tags', '["futebol", "liga dos campeões", "liga europa", "premier league", "moçambola", "transferências", "mercado", "seleção", "lesão", "arbitragem"]'::jsonb),

  -- ritmo de publicação (docs/publicador/EDITORIAL.md §9); enforce_review_gate
  -- já aplica max_published_per_day e min_minutes_between_publications;
  -- max_per_source_per_day e require_manual_edit_every_n são aplicados por
  -- scheduler.auto_publish_ready() quando o piloto automático está ligado
  ('publishing_limits', '{"max_published_per_day": 8, "min_minutes_between_publications": 45, "max_per_source_per_day": 3, "require_manual_edit_every_n": 5}'::jsonb),

  -- piloto automático (apps/web Automacao.tsx): desligado por omissão — ligar
  -- é uma decisão humana explícita, não o default
  ('autopilot', '{"enabled": false, "auto_published_streak": 0}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- fonte de exemplo: feed RSS de futebol da ESPN (confirmado ativo/válido).
-- A curadoria de relevância vem da escolha do feed em si (é só de futebol) —
-- por isso sem `keywords` aqui: relevance_score() usa o neutro 0.5 (ver
-- apps/api/app/services/scoring.py). Adiciona mais fontes (Record, A Bola,
-- Sky Sports, ...) em Config → Fontes de tendências no painel.
insert into public.sources (kind, niche, config, enabled) values
  ('rss', 'football', '{
     "url": "https://www.espn.com/espn/rss/soccer/news",
     "region": "INT",
     "max_items": 10
   }'::jsonb, true);
