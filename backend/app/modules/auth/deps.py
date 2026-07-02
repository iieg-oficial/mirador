"""Punto único de entrada de auth para el resto de la app.

Los módulos importan SIEMPRE desde aquí:

    from app.modules.auth.deps import get_current_user, require_permission

Nunca desde `minerva.py` ni desde `minerva_sdk` directamente. La autenticación es
siempre Minerva; no hay selector de proveedor ni modo "sin auth". En tests, estas
dependencias se sustituyen con `app.dependency_overrides` (ver `conftest.py`).
"""

from fastapi import Depends, HTTPException, Request, status

from app.modules.auth import minerva
from app.modules.auth.models import CurrentUser


async def get_current_user(request: Request) -> CurrentUser:
    """Dependency: identidad del request (401 si no hay sesión válida)."""
    return await minerva.resolve_user(request)


async def require_app_access(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Dependency: exige que el usuario tenga al menos un rol en Tablerillos.

    Puerta de acceso gruesa: tener cuenta en Minerva no basta; Minerva debe haber
    asignado a la persona algún rol en esta aplicación. Sin rol → 403, aun antes
    de evaluar permisos finos. Úsalo para proteger el "entrar al panel".
    """
    if not user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a Tablerillos. Solicita un rol en Minerva.",
        )
    return user


def require_permission(permission: str):
    """Factory de dependency que exige `permission` (403 si no lo tiene).

    Uso:  Depends(require_permission("tablerillos.connections.create"))
    """

    async def dependency(
        request: Request,
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        await minerva.assert_permission(request, user, permission)
        return user

    return dependency
