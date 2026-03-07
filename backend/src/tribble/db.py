from functools import lru_cache

from supabase import Client, create_client

from tribble.config import get_settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_key:
        raise RuntimeError("Supabase not configured. Set TRIBBLE_SUPABASE_URL and TRIBBLE_SUPABASE_SERVICE_KEY.")
    return create_client(settings.supabase_url, settings.supabase_service_key)
