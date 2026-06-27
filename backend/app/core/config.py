"""Configuración central de Tablerillos.

Carga todas las variables de entorno (ver `.env.example` en la raíz y en
`backend/`) en un objeto `Settings` tipado. `get_settings()` está cacheado para
que el parseo ocurra una sola vez por proceso.

La autenticación es **siempre** Minerva (OIDC + `minerva-sdk`): no hay proveedor
alternativo ni modo "sin auth". Minerva suple el login y la gestión de usuarios
que todo sistema institucional debe tener. En tests, la auth se sustituye con
`dependency_overrides` (ver `app/tests/conftest.py`), nunca con un mock en la app.
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ----- App -----
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = True

    # ----- Base de datos / Redis -----
    DATABASE_URL: str = (
        "postgresql+psycopg://tablerillos:change-me-postgres@localhost:5432/tablerillos"
    )
    REDIS_URL: str = "redis://localhost:6379/0"

    # ----- Cifrado de credenciales de conexiones (Fernet) -----
    SECRET_ENCRYPTION_KEY: str | None = None

    # ----- Sesión BFF -----
    SESSION_COOKIE_NAME: str = "tb_session"
    SESSION_SECRET: str = "change-me-session-secret"
    SESSION_TTL_SECONDS: int = 86400

    # ----- Minerva (backend → Minerva, server-to-server) -----
    MINERVA_ISSUER_URL: str = "http://localhost:9000"
    MINERVA_PUBLIC_ISSUER_URL: str = "http://localhost:9000"
    MINERVA_EXPECTED_ISSUER: str = "http://localhost:9000"
    MINERVA_APPLICATION_CODE: str = "tablerillos"
    MINERVA_CLIENT_ID: str | None = None
    MINERVA_CLIENT_SECRET: str | None = None
    MINERVA_REDIRECT_URI: str = "http://localhost:8000/api/auth/callback"
    MINERVA_SCOPES: str = "openid profile email"
    MINERVA_VERIFY_AUD: bool = True
    MINERVA_JWKS_CACHE_TTL: int = 3600
    MINERVA_PERMISSIONS_CACHE_TTL: int = 300
    FRONTEND_POST_LOGIN_URL: str = "http://localhost:5173/admin"

    # ----- CORS -----
    CORS_ALLOW_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ALLOW_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
