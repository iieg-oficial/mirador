"""Endpoints de auth (BFF). Ver `docs/api.md` §Auth.

Flujo OIDC Authorization Code + PKCE contra Minerva (única fuente de identidad):
`/login` genera PKCE, guarda el estado en Redis y redirige a Minerva; `/callback`
canjea el código y establece la cookie de sesión `tb_session`; `/logout` revoca y
limpia. No hay modo alternativo ni "sin auth".
"""

import secrets
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.config import get_settings
from app.modules.auth.deps import get_current_user
from app.modules.auth.models import CurrentUser
from app.modules.auth.session import SessionStore

router = APIRouter()


@router.get("/me", response_model=CurrentUser)
async def me(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return user


@router.get("/login")
async def login() -> RedirectResponse:
    settings = get_settings()

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

    from app.modules.auth.oidc import exchange_code_for_tokens

    try:
        tokens = await exchange_code_for_tokens(settings, code, oidc_data["code_verifier"])
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al canjear el código con Minerva: {exc}",
        ) from exc

    # La sesión BFF guarda solo los tokens; la identidad (sub/email/name/roles) se
    # deriva en cada request decodificando el access_token con el SDK (firma
    # RS256/JWKS verificada). Ver `minerva.resolve_user`.
    sid = secrets.token_urlsafe(32)
    session_data = {
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
        session_data = store.get(f"session:{sid}")
        if session_data and session_data.get("refresh_token"):
            from app.modules.auth.oidc import revoke_token

            await revoke_token(settings, session_data["refresh_token"])
        store.delete(f"session:{sid}")
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
