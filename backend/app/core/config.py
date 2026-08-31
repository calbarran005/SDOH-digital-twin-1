from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "SDOH Digital Twin API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DATABASE_URL: str = (
        "postgresql+psycopg2://sdohtwin:sdohtwin@localhost:5432/sdohtwin"
    )

    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 840
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    BACKEND_CORS_ORIGINS: str = '["http://localhost:5173","http://localhost:3000"]'


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
