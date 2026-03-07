from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TRIBBLE_", extra="ignore")

    supabase_url: str = ""
    supabase_service_key: str = Field(default="", repr=False)
    supabase_anon_key: str = Field(default="", repr=False)
    acled_api_key: str = Field(default="", repr=False)
    acled_email: str = ""
    openweathermap_api_key: str = Field(default="", repr=False)
    zai_api_key: str = Field(default="", repr=False)
    zai_model: str = "glm-4"
    enable_openclaw: bool = False
    enable_flock: bool = False
    enable_satellite_ml: bool = False
    flock_api_base_url: str = "https://api.flock.io/v1"
    flock_api_key: str = Field(default="", repr=False)
    flock_model: str = "meta-llama/Llama-3.3-70B-Instruct"
    sentinel_stac_url: str = "https://planetarycomputer.microsoft.com/api/stac/v1"
    satellite_cloud_cover_threshold: float = 40.0
    satellite_min_scl_clear_pct: float = 60.0
    satellite_change_window_days: int = 14
    satellite_ml_provider_url: str = ""
    satellite_ml_api_key: str = Field(default="", repr=False)
    pipeline_max_retries: int = 3
    cluster_radius_km: float = 5.0
    cluster_time_window_hours: int = 72
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]
    gemini_api_key: str = Field(default="", repr=False)
    gemini_model: str = "gemini-2.5-flash"
    discord_webhook_url: str = ""
    open_meteo_base_url: str = "https://archive-api.open-meteo.com/v1/archive"
    open_meteo_forecast_url: str = "https://api.open-meteo.com/v1/forecast"


@lru_cache
def get_settings() -> Settings:
    return Settings()
