from supabase import Client, create_client

from .config import settings

# Cliente com service_role — só existe aqui (guardrail #4). Nunca no frontend.
supabase: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)
