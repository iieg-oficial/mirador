"""Modelo de identidad resuelta por Minerva.

No hay tablas de usuarios/roles locales: la identidad y la autorización viven en
Minerva. Este modelo es solo el resultado, ya validado, de resolver el request.
"""

from pydantic import BaseModel


class CurrentUser(BaseModel):
    """Identidad resuelta del request. `sub` es el identificador de Minerva.

    `roles` son los slugs de los roles que Minerva asigna al usuario **en esta
    aplicación** (`tablerillos`). Una lista vacía significa que el usuario tiene
    cuenta en Minerva pero no pertenece a Tablerillos: no debe entrar al panel
    (ver `require_app_access` en `deps.py`). Es la puerta de acceso gruesa, previa
    a los permisos finos de cada acción.
    """

    sub: str
    email: str | None = None
    name: str | None = None
    roles: list[str] = []
