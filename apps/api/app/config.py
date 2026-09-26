from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração a partir de variáveis de ambiente (ver .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    brave_search_api_key: str = ""

    # Provedor "anthropic-env": Claude via o proxy AWS empresarial — mesmo padrão
    # dos projetos `explicador`/`portifolio`. Outros provedores (e as suas chaves,
    # no Vault) configuram-se no painel — ver app/llm.py.
    anthropic_api_key: str
    anthropic_base_url: str = "https://aws-external-anthropic.us-east-2.api.aws"
    anthropic_workspace_id: str = ""
    anthropic_model: str = "claude-haiku-4-5"

    # em dev sem acesso à fonte real: 'true' permite artigo-fonte mock (NUNCA em produção)
    allow_mock_facts: bool = False

    trends_sync_interval_min: int = 10
    generate_poll_interval_min: int = 2
    max_generate_attempts: int = 3
    # traduções dos artigos publicados (settings.translation) — ver services/translate.py
    translate_poll_interval_min: int = 2
    # topics presos em 'processing' há mais do que isto (ex.: backend reiniciou
    # a meio de uma geração) passam a 'failed' em vez de ficarem órfãos para sempre
    stale_processing_minutes: int = 15
    # piloto automático (settings.autopilot): cadência do ciclo que deteta,
    # gera E publica sozinho enquanto o interruptor estiver ligado — bem mais
    # curta que os ciclos normais acima, para o botão parecer instantâneo
    autopilot_tick_interval_sec: int = 20
    # quantos topics 'approved_for_gen' cada ciclo do piloto tenta gerar de
    # seguida (o ciclo normal, generate_poll_interval_min, continua a usar 5)
    autopilot_generate_batch: int = 25


settings = Settings()  # type: ignore[call-arg]
