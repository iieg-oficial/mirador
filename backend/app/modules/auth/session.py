"""Almacén de sesiones BFF en Redis.

Guarda el estado del flujo OIDC (`state`, `code_verifier`, `nonce`) y, tras el
login, los tokens de Minerva. El navegador solo ve la cookie `tb_session`; los
tokens nunca salen del backend. Usado por `MinervaAuthProvider`.
"""

import json
from typing import Any

import redis

from app.core.config import get_settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Cliente Redis perezoso (no conecta al importar el módulo)."""
    global _client
    if _client is None:
        _client = redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    return _client


class SessionStore:
    prefix = "session:"

    def get(self, sid: str) -> dict[str, Any] | None:
        raw = get_redis().get(self.prefix + sid)
        return json.loads(raw) if raw else None

    def set(self, sid: str, data: dict[str, Any], ttl: int) -> None:
        get_redis().set(self.prefix + sid, json.dumps(data), ex=ttl)

    def delete(self, sid: str) -> None:
        get_redis().delete(self.prefix + sid)
