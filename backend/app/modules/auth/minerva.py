"""Proveedor de auth real contra Minerva (BFF/OIDC).

Implementa el flujo BFF completo: lee la cookie de sesión `tb_session`, consulta
Redis para obtener el access_token del usuario, y verifica permisos contra la API
de Minerva en tiempo real. Los permisos se cachean en Redis para minimizar llamadas
al IdP (TTL configurado en `MINERVA_PERMISSIONS_CACHE_TTL`).

El canje de código y el almacenamiento inicial de sesión ocurren en
`app.modules.auth.router` (endpoints /login y /callback).
"""

from typing import Any

import httpx
from fastapi import HTTPException, Request, status

from app.core.config import Settings
from app.modules.auth.provider import CurrentUser
from app.modules.auth.session import SessionStore


class MinervaAuthProvider:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._sessions = SessionStore()

    async def get_current_user(self, request: Request) -> CurrentUser:
        sid = request.cookies.get(self._settings.SESSION_COOKIE_NAME)
        if not sid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No hay sesión activa. Inicia sesión.",
            )
        session_data = self._sessions.get(f"session:{sid}")
        if not session_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sesión expirada o inválida.",
            )
        return CurrentUser(
            sub=session_data.get("sub", ""),
            email=session_data.get("email"),
            name=session_data.get("name"),
        )

    async def check_permission(self, request: Request, user: CurrentUser, permission: str) -> None:
        sid = request.cookies.get(self._settings.SESSION_COOKIE_NAME)
        if not sid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sin sesión.")
        session_data = self._sessions.get(f"session:{sid}")
        if not session_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión expirada."
            )

        # Cache de permisos por usuario en Redis
        cache_key = f"permissions:{user.sub}"
        cached = self._sessions.get(cache_key)
        if cached:
            permissions: list[str] = cached.get("permissions", [])
        else:
            permissions = await self._fetch_permissions(session_data.get("access_token", ""))
            self._sessions.set(
                cache_key,
                {"permissions": permissions},
                self._settings.MINERVA_PERMISSIONS_CACHE_TTL,
            )

        if permission not in permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permiso requerido: {permission}",
            )

    async def _fetch_permissions(self, access_token: str) -> list[str]:
        """Consulta los permisos del usuario actual en Minerva (API en tiempo real)."""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self._settings.MINERVA_ISSUER_URL}/api/v1/me/permissions",
                    params={"application": self._settings.MINERVA_APPLICATION_CODE},
                    headers={"Authorization": f"Bearer {access_token}"},
                    timeout=5.0,
                )
                resp.raise_for_status()
                data: Any = resp.json()
                items: list[Any] = data if isinstance(data, list) else data.get("permissions", [])
                return [
                    p.get("key", p) if isinstance(p, dict) else str(p) for p in items
                ]
        except Exception:
            # Denegar por seguridad si Minerva no está disponible.
            return []
