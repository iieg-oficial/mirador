"""Contrato de autenticación/autorización.

Toda la app consume auth a través de esta interfaz, **nunca** importando
`minerva_sdk` directamente. Así el desarrollo no depende del SDK ni del PAT: en
dev corre el `StubAuthProvider`; el `MinervaAuthProvider` se activa por
configuración (`AUTH_PROVIDER=minerva`) sin tocar ningún módulo funcional.

La firma de `check_permission` refleja el contrato de Minerva: la autorización
se decide en tiempo real contra un permiso `tablerillos.{resource}.{action}`,
nunca comparando roles localmente (ver `docs/auth-minerva.md`).
"""

from typing import Protocol, runtime_checkable

from fastapi import Request
from pydantic import BaseModel


class CurrentUser(BaseModel):
    """Identidad resuelta del request. `sub` es el identificador de Minerva."""

    sub: str
    email: str | None = None
    name: str | None = None


@runtime_checkable
class AuthProvider(Protocol):
    async def get_current_user(self, request: Request) -> CurrentUser:
        """Resuelve la identidad del request o lanza 401 si no hay sesión válida."""
        ...

    async def check_permission(self, request: Request, user: CurrentUser, permission: str) -> None:
        """Autoriza `permission` para `user`; lanza 403 si no lo tiene."""
        ...
