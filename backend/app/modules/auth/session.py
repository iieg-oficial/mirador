"""Almacén de sesiones BFF en Redis.

Guarda el estado del flujo OIDC (`state`, `code_verifier`, `nonce`) y, tras el
login, los tokens de Minerva. El navegador solo ve la cookie `tb_session`; los
tokens nunca salen del backend. Usado por `minerva.py` y el router de auth.

Las claves se pasan ya namespaceadas por el llamador (`oidc:{state}`,
`session:{sid}`); este almacén no añade prefijo.
"""

import json
from typing import Any

import redis
from fastapi import HTTPException, status

from app.core.config import get_settings

_client: redis.Redis | None = None

_UNAVAILABLE_DETAIL = "El servicio de sesión no está disponible. Inténtalo de nuevo más tarde."


def get_redis() -> redis.Redis:
    """Cliente Redis perezoso (no conecta al importar el módulo)."""
    global _client
    if _client is None:
        _client = redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    return _client


class SessionStore:
    """Punto único de acceso a Redis para sesiones: si Redis está caído
    responde 503 controlado en lugar del 500 genérico (login, callback,
    logout y cada request autenticado pasan por aquí)."""

    def get(self, key: str) -> dict[str, Any] | None:
        try:
            raw = get_redis().get(key)
        except redis.RedisError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=_UNAVAILABLE_DETAIL
            ) from exc
        return json.loads(raw) if raw else None

    def set(self, key: str, data: dict[str, Any], ttl: int) -> None:
        try:
            get_redis().set(key, json.dumps(data), ex=ttl)
        except redis.RedisError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=_UNAVAILABLE_DETAIL
            ) from exc

    def delete(self, key: str) -> None:
        try:
            get_redis().delete(key)
        except redis.RedisError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=_UNAVAILABLE_DETAIL
            ) from exc
