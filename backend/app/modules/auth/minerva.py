"""Proveedor de auth real contra Minerva (BFF/OIDC).

El `minerva_sdk` se importa de forma **perezosa** (dentro de los métodos), de
modo que la ausencia del SDK no rompe el arranque mientras `AUTH_PROVIDER=stub`.
El flujo OIDC completo (login/callback/refresh) y la validación de permisos se
implementan al hacer el *swap* a Minerva; hasta entonces estos métodos fallan de
forma clara y controlada.

Dependencias para activarlo:
  1. `pip install -e ".[dev,minerva]"` (requiere GITHUB_TOKEN / PAT).
  2. Importar `manifest.minerva.yml` y poblar MINERVA_CLIENT_ID/SECRET en `.env`.
  3. `AUTH_PROVIDER=minerva`.
"""

from typing import Any

from fastapi import Request

from app.core.config import Settings
from app.modules.auth.provider import CurrentUser
from app.modules.auth.session import SessionStore


class MinervaAuthProvider:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._sessions = SessionStore()
        self._sdk: Any | None = None

    def _ensure_sdk(self) -> Any:
        """Importa minerva_sdk solo cuando realmente se necesita."""
        if self._sdk is None:
            try:
                import minerva_sdk  # type: ignore[import-not-found]
            except ImportError as exc:  # pragma: no cover - depende del entorno
                raise RuntimeError(
                    "minerva-sdk no está instalado. Instala el extra con un PAT "
                    'válido: pip install -e ".[dev,minerva]" (GITHUB_TOKEN).'
                ) from exc
            self._sdk = minerva_sdk
        return self._sdk

    async def get_current_user(self, request: Request) -> CurrentUser:
        # TODO(swap-minerva): resolver cookie de sesión → Redis → access_token,
        # validar id_token (RS256 vía JWKS) y mapear a CurrentUser usando el SDK.
        raise NotImplementedError(
            "Flujo BFF/OIDC con Minerva pendiente de implementar (swap del SDK)."
        )

    async def check_permission(
        self, request: Request, user: CurrentUser, permission: str
    ) -> None:
        # TODO(swap-minerva): delegar a minerva_sdk.require_permission con el
        # access_token de la sesión; Minerva decide en tiempo real.
        raise NotImplementedError(
            "Verificación de permisos con Minerva pendiente (swap del SDK)."
        )
