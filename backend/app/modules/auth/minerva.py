"""Integración de auth con Minerva, montada sobre el `minerva-sdk` oficial.

Minerva es la **única** fuente de identidad y autorización; no hay proveedor
alternativo ni modo "sin auth". Patrón BFF: el navegador solo ve la cookie
`tb_session`; el access_token vive en Redis, server-side, y nunca sale del
backend. Estas funciones lo recuperan y delegan TODA la validación al SDK,
evitando reimplementar criptografía o el contrato de permisos:

- **Identidad:** el SDK verifica la firma del access_token (RS256 contra el JWKS
  público de Minerva, sin secreto compartido) y devuelve los claims.
- **Autorización:** el SDK consulta `GET /api/v1/me/permissions` en tiempo real
  (con caché y propagación de revocación), nunca compara roles localmente.

El canje del código y el alta de la sesión en Redis ocurren en `router.py`
(endpoints /login y /callback). El SDK lee su propia configuración
(`MINERVA_ISSUER_URL`, `MINERVA_APPLICATION_CODE`, …) desde el entorno;
docker-compose la inyecta vía `env_file`.

El `import minerva_sdk` es perezoso (dentro de cada función) solo para poder
importar la app en entornos de test/CI sin el paquete privado; en producción y
desarrollo el SDK es obligatorio (dependencia base, ver `pyproject.toml`).
"""

from fastapi import HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials

from app.core.config import get_settings
from app.modules.auth.models import CurrentUser
from app.modules.auth.session import SessionStore

_sessions = SessionStore()


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sesión expirada o inválida. Inicia sesión de nuevo.",
    )


def _load_session(request: Request) -> tuple[str, dict]:
    """Devuelve (sid, sesión BFF) o lanza 401 si no hay cookie/sesión válida."""
    settings = get_settings()
    sid = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not sid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No hay sesión activa. Inicia sesión.",
        )
    session = _sessions.get(f"session:{sid}")
    if not session or not session.get("access_token"):
        raise _unauthorized()
    return sid, session


def _access_token(request: Request) -> str:
    """Recupera el access_token de la sesión BFF (ya refrescado si hizo falta)."""
    _, session = _load_session(request)
    return str(session["access_token"])


async def _claims_from_token(token: str) -> dict:
    from minerva_sdk.fastapi import get_current_user as sdk_get_current_user

    return await sdk_get_current_user(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    )


async def _refresh_and_retry(sid: str, session: dict) -> dict:
    """Rota los tokens con el refresh_token, persiste el par nuevo y revalida.

    Mantiene viva la sesión BFF (TTL de horas) cuando el access_token de Minerva,
    de vida corta, expira. El refresh_token es single-use: se reemplaza el
    almacenado por el que devuelve Minerva (contrato "Refresh And Logout").
    """
    from app.modules.auth.oidc import refresh_tokens

    refresh_token = session.get("refresh_token")
    if not refresh_token:
        raise _unauthorized()

    settings = get_settings()
    try:
        tokens = await refresh_tokens(settings, str(refresh_token))
    except Exception as exc:  # noqa: BLE001 — cualquier fallo de refresh ⇒ re-login
        raise _unauthorized() from exc

    session["access_token"] = tokens.get("access_token", "")
    session["refresh_token"] = tokens.get("refresh_token", refresh_token)
    _sessions.set(f"session:{sid}", session, ttl=settings.SESSION_TTL_SECONDS)

    try:
        return await _claims_from_token(str(session["access_token"]))
    except HTTPException as exc:
        raise _unauthorized() from exc


async def resolve_user(request: Request) -> CurrentUser:
    """Resuelve la identidad del request validando el token con el SDK.

    Si el access_token expiró, intenta refrescarlo una vez con el refresh_token
    antes de rendirse con 401.
    """
    sid, session = _load_session(request)
    try:
        claims = await _claims_from_token(str(session["access_token"]))
    except HTTPException:
        claims = await _refresh_and_retry(sid, session)

    # `roles` del token = slugs de los roles del usuario en esta aplicación
    # (Minerva los calcula sobre app.slug=tablerillos al emitir el token).
    # Vacío ⇒ no pertenece a Tablerillos (gate en require_app_access).
    roles = claims.get("roles") or []
    return CurrentUser(
        sub=claims.get("sub", ""),
        email=claims.get("email"),
        name=claims.get("name"),
        roles=[str(r) for r in roles],
    )


async def assert_permission(request: Request, user: CurrentUser, permission: str) -> None:
    """Autoriza `permission` contra Minerva en tiempo real; lanza 403 si falta."""
    from minerva_sdk.fastapi import require_permission as sdk_require_permission

    settings = get_settings()
    token = _access_token(request)
    # Reusa la dependencia de permisos del SDK (validación en tiempo real +
    # caché + revocación), alimentándola con los datos ya resueltos en vez de
    # releer la cabecera Authorization (que en el modelo BFF no existe).
    dependency = sdk_require_permission(permission, settings.MINERVA_APPLICATION_CODE)
    await dependency(user={"sub": user.sub, "_token": token})
