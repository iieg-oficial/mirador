"""Punto único de entrada de auth para el resto de la app.

Los módulos importan SIEMPRE desde aquí:

    from app.modules.auth.deps import get_current_user, require_permission

Nunca desde `minerva.py` ni desde `minerva_sdk`. El proveedor concreto se elige
según `settings.AUTH_PROVIDER` y se construye una sola vez por proceso.
"""

from fastapi import Depends, Request

from app.core.config import get_settings
from app.modules.auth.provider import AuthProvider, CurrentUser
from app.modules.auth.stub import StubAuthProvider

_provider: AuthProvider | None = None


def _build_provider() -> AuthProvider:
    settings = get_settings()
    if settings.AUTH_PROVIDER == "stub":
        if settings.is_production:
            # Fail-closed: jamás arrancar sin auth real en producción.
            raise RuntimeError(
                "AUTH_PROVIDER=stub no está permitido en producción. "
                "Configura AUTH_PROVIDER=minerva."
            )
        return StubAuthProvider(
            CurrentUser(
                sub=settings.DEV_USER_SUB,
                email=settings.DEV_USER_EMAIL,
                name=settings.DEV_USER_NAME,
            )
        )
    if settings.AUTH_PROVIDER == "minerva":
        # Import perezoso: no cargar el SDK salvo que se use Minerva.
        from app.modules.auth.minerva import MinervaAuthProvider

        return MinervaAuthProvider(settings)
    raise RuntimeError(f"AUTH_PROVIDER desconocido: {settings.AUTH_PROVIDER!r}")


def get_provider() -> AuthProvider:
    global _provider
    if _provider is None:
        _provider = _build_provider()
    return _provider


async def get_current_user(request: Request) -> CurrentUser:
    """Dependency: identidad del request (401 si no hay sesión válida)."""
    return await get_provider().get_current_user(request)


def require_permission(permission: str):
    """Factory de dependency que exige `permission` (403 si no lo tiene).

    Uso:  Depends(require_permission("tablerillos.connections.create"))
    """

    async def dependency(
        request: Request,
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        await get_provider().check_permission(request, user, permission)
        return user

    return dependency
