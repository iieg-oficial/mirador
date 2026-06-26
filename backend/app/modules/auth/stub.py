"""Proveedor de auth para desarrollo, sin Minerva.

Devuelve un usuario dev fijo y, por defecto, concede cualquier permiso. Para
probar respuestas 403 en dev/tests, el cliente puede mandar el header
`X-Dev-Permissions` con la lista de permisos concedidos (CSV); cualquier permiso
fuera de esa lista será denegado.

Este proveedor **se niega a usarse en producción** (ver `deps.py`).
"""

from fastapi import HTTPException, Request, status

from app.modules.auth.provider import CurrentUser


class StubAuthProvider:
    def __init__(self, user: CurrentUser) -> None:
        self._user = user

    async def get_current_user(self, request: Request) -> CurrentUser:
        return self._user

    async def check_permission(
        self, request: Request, user: CurrentUser, permission: str
    ) -> None:
        header = request.headers.get("X-Dev-Permissions")
        if header is None:
            # Sin header: modo "conceder todo" para desarrollo ágil.
            return
        granted = {p.strip() for p in header.split(",") if p.strip()}
        if permission not in granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permiso requerido: {permission}",
            )
