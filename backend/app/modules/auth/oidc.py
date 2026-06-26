"""Utilidades para el flujo OIDC Authorization Code + PKCE contra Minerva."""

import base64
import hashlib
import json
import secrets
from typing import Any

import httpx

from app.core.config import Settings


def generate_code_verifier() -> str:
    """Genera un code_verifier PKCE aleatorio (RFC 7636, ≥43 chars)."""
    return secrets.token_urlsafe(64)


def derive_code_challenge(verifier: str) -> str:
    """Deriva el code_challenge S256 del verifier."""
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def decode_jwt_payload(token: str) -> dict[str, Any]:
    """Extrae el payload de un JWT sin verificar la firma.

    Los tokens son obtenidos directamente de Minerva vía un canje server-to-server
    autenticado con client_secret, lo que garantiza su origen.
    TODO(swap-minerva): agregar validación RS256 vía JWKS para producción.
    """
    parts = token.split(".")
    if len(parts) < 2:
        return {}
    padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(padded))
    except Exception:
        return {}


async def exchange_code_for_tokens(
    settings: Settings, code: str, code_verifier: str
) -> dict[str, Any]:
    """Canjea el authorization code por tokens (server-to-server contra Minerva)."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.MINERVA_ISSUER_URL}/auth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.MINERVA_CLIENT_ID or "",
                "client_secret": settings.MINERVA_CLIENT_SECRET or "",
                "code": code,
                "redirect_uri": settings.MINERVA_REDIRECT_URI,
                "code_verifier": code_verifier,
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json()  # type: ignore[no-any-return]


async def revoke_token(settings: Settings, token: str) -> None:
    """Revoca un token (refresh_token) en Minerva. Best-effort."""
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.MINERVA_ISSUER_URL}/auth/revoke",
                data={
                    "client_id": settings.MINERVA_CLIENT_ID or "",
                    "token": token,
                },
                timeout=5.0,
            )
    except Exception:
        pass  # Si falla la revocación, la sesión ya fue eliminada de Redis
