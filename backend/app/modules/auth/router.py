"""Endpoints de auth (BFF). Ver `docs/api.md` §Auth.

En modo `stub` no hay IdP: `/login` lleva directo al SPA y `/me` devuelve el
usuario dev. En modo `minerva` se implementa el flujo OIDC Authorization Code + PKCE
completo: generación de PKCE, almacenamiento de estado en Redis, canje de código
y establecimiento de la cookie de sesión `tb_session`.
"""

import secrets
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.config import get_settings
from app.modules.auth.deps import get_current_user
from app.modules.auth.provider import CurrentUser
from app.modules.auth.session import SessionStore

router = APIRouter()


@router.get("/me", response_model=CurrentUser)
async def me(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return user


@router.get("/permissions")
async def permissions(user: CurrentUser = Depends(get_current_user)) -> dict[str, list[str]]:
    settings = get_settings()
    if settings.AUTH_PROVIDER == "stub":
        # "*" = el stub concede todo; el SPA puede tratarlo como acceso total.
        return {"permissions": ["*"]}
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Permisos por recurso; usa los endpoints de /api/admin/* directamente.",
    )


@router.get("/login")
async def login() -> RedirectResponse:
    settings = get_settings()
    if settings.AUTH_PROVIDER == "stub":
        return RedirectResponse(settings.FRONTEND_POST_LOGIN_URL)

    # Flujo OIDC Authorization Code + PKCE
    from app.modules.auth.oidc import derive_code_challenge, generate_code_verifier

    verifier = generate_code_verifier()
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(16)

    store = SessionStore()
    store.set(f"oidc:{state}", {"code_verifier": verifier, "nonce": nonce}, ttl=300)

    params = {
        "client_id": settings.MINERVA_CLIENT_ID or "",
        "redirect_uri": settings.MINERVA_REDIRECT_URI,
        "response_type": "code",
        "scope": settings.MINERVA_SCOPES,
        "state": state,
        "code_challenge": derive_code_challenge(verifier),
        "code_challenge_method": "S256",
        "nonce": nonce,
    }
    # El navegador usa la URL pública de Minerva (no la interna del contenedor).
    authorize_url = (
        f"{settings.MINERVA_PUBLIC_ISSUER_URL}/auth/authorize?"
        + urllib.parse.urlencode(params)
    )
    return RedirectResponse(authorize_url)


@router.get("/callback")
async def callback(request: Request) -> RedirectResponse:
    settings = get_settings()
    if settings.AUTH_PROVIDER == "stub":
        return RedirectResponse(settings.FRONTEND_POST_LOGIN_URL)

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minerva rechazó el login: {error}",
        )
    if not code or not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Parámetros de callback inválidos.",
        )

    store = SessionStore()
    oidc_data = store.get(f"oidc:{state}")
    if not oidc_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Estado OIDC inválido o expirado. Intenta iniciar sesión de nuevo.",
        )
    store.delete(f"oidc:{state}")

    from app.modules.auth.oidc import decode_jwt_payload, exchange_code_for_tokens

    try:
        tokens = await exchange_code_for_tokens(settings, code, oidc_data["code_verifier"])
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al canjear el código con Minerva: {exc}",
        ) from exc

    id_token = tokens.get("id_token", "")
    claims = decode_jwt_payload(id_token) if id_token else {}

    sid = secrets.token_urlsafe(32)
    session_data = {
        "sub": claims.get("sub", ""),
        "email": claims.get("email"),
        "name": claims.get("name"),
        "access_token": tokens.get("access_token", ""),
        "refresh_token": tokens.get("refresh_token", ""),
    }
    store.set(f"session:{sid}", session_data, ttl=settings.SESSION_TTL_SECONDS)

    response = RedirectResponse(settings.FRONTEND_POST_LOGIN_URL)
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=sid,
        httponly=True,
        max_age=settings.SESSION_TTL_SECONDS,
        samesite="lax",
        secure=settings.is_production,
    )
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response) -> None:
    settings = get_settings()
    sid = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if sid:
        store = SessionStore()
        if settings.AUTH_PROVIDER == "minerva":
            session_data = store.get(f"session:{sid}")
            if session_data and session_data.get("refresh_token"):
                from app.modules.auth.oidc import revoke_token

                await revoke_token(settings, session_data["refresh_token"])
        store.delete(f"session:{sid}")
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
