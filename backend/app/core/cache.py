"""Cliente Redis para cache de resultados de datasets.

El cache evita re-ejecutar la misma query SQL en cada petición. El TTL se
configura por dataset (campo `cache_ttl_seconds`). Un TTL de 0 deshabilita
el cache para ese dataset.

La key incluye: dataset_id + hash de los params para que distintos conjuntos
de parámetros no colisionen.
"""

import hashlib
import json
import logging
from typing import Any

import redis
from redis.exceptions import RedisError

from app.core.config import get_settings

log = logging.getLogger(__name__)

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        settings = get_settings()
        _client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


def _make_key(dataset_id: str, params: dict[str, Any]) -> str:
    params_hash = hashlib.sha256(
        json.dumps(params, sort_keys=True, default=str).encode()
    ).hexdigest()[:12]
    return f"ds:{dataset_id}:{params_hash}"


def get_cached(dataset_id: str, params: dict[str, Any]) -> dict | None:
    """Devuelve el resultado cacheado o None si no existe / Redis no disponible."""
    try:
        raw = get_redis().get(_make_key(dataset_id, params))
        return json.loads(raw) if raw else None
    except (RedisError, Exception) as exc:
        log.warning("Cache GET falló, se omite: %s", exc)
        return None


def set_cached(
    dataset_id: str,
    params: dict[str, Any],
    data: dict,
    ttl_seconds: int,
) -> None:
    """Guarda el resultado en cache. Falla silenciosamente si Redis no está disponible."""
    if ttl_seconds <= 0:
        return
    try:
        get_redis().setex(
            _make_key(dataset_id, params),
            ttl_seconds,
            json.dumps(data, default=str),
        )
    except (RedisError, Exception) as exc:
        log.warning("Cache SET falló, se omite: %s", exc)


def invalidate(dataset_id: str) -> None:
    """Elimina todas las entradas de cache de un dataset (por patrón de key)."""
    try:
        r = get_redis()
        keys = r.keys(f"ds:{dataset_id}:*")
        if keys:
            r.delete(*keys)
    except (RedisError, Exception) as exc:
        log.warning("Cache INVALIDATE falló, se omite: %s", exc)
