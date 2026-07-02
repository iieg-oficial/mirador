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

from pydantic import model_validator
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
    # El sid de sesión es un token opaco (secrets.token_urlsafe) guardado en Redis;
    # la cookie no se firma, así que no hay SESSION_SECRET.
    SESSION_COOKIE_NAME: str = "tb_session"
    SESSION_TTL_SECONDS: int = 86400

    # ----- Minerva (backend → Minerva, server-to-server) -----
    # El minerva-sdk lee su propia config (issuer esperado, verificación de aud,
    # TTL de JWKS/permisos) directamente del entorno; no se replica en Settings.
    MINERVA_ISSUER_URL: str = "http://localhost:9000"
    MINERVA_PUBLIC_ISSUER_URL: str = "http://localhost:9000"
    MINERVA_APPLICATION_CODE: str = "tablerillos"
    MINERVA_CLIENT_ID: str | None = None
    MINERVA_CLIENT_SECRET: str | None = None
    MINERVA_REDIRECT_URI: str = "http://localhost:8000/api/auth/callback"
    MINERVA_SCOPES: str = "openid profile email"
    FRONTEND_POST_LOGIN_URL: str = "http://localhost:5173/admin"

    # ----- CORS -----
    CORS_ALLOW_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ALLOW_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @model_validator(mode="after")
    def _reject_insecure_production(self) -> "Settings":
        """Falla el arranque si en producción quedaron valores de dev/placeholder."""
        if not self.is_production:
            return self
        problems: list[str] = []
        if self.DEBUG:
            problems.append("DEBUG debe ser false en producción (evita echo de SQL en logs).")
        if not self.SECRET_ENCRYPTION_KEY:
            problems.append("SECRET_ENCRYPTION_KEY es obligatoria en producción.")
        if "change-me" in self.DATABASE_URL:
            problems.append("DATABASE_URL sigue con credenciales placeholder ('change-me').")
        if not self.MINERVA_CLIENT_ID or not self.MINERVA_CLIENT_SECRET:
            problems.append("MINERVA_CLIENT_ID/SECRET son obligatorios en producción.")
        if problems:
            raise ValueError("Configuración insegura para producción:\n- " + "\n- ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
