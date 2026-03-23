from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "Academic Weapon"
    debug: bool = False

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # AI
    gemini_api_key: str

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()

"""
BaseSettings from pydantic-settings reads environment variables automatically. The variable names match your 
.env keys (case-insensitive). If a required variable is missing when the app starts, 
it crashes immediately with a clear error — rather than failing silently at runtime when you actually try to 
use the key.

@lru_cache() means get_settings() only creates the Settings object once, no matter how many times you call it. 
lru_cache stands for "least recently used cache" — it memoizes the function's return value. Settings are read 
once at startup, not re-read on every request.
"""