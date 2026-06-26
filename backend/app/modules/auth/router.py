"""Endpoints de auth (BFF). Ver `docs/api.md` §Auth.

En modo `stub` no hay IdP: `/login` lleva directo al SPA y `/me` devuelve el
usuario dev. En modo `minerva` el flujo OIDC completo se implementa en el swap;
hasta entonces los endpoints de flujo responden 501 de forma explícita.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.config import get_settings
from app.modules.auth.deps import get_current_user
from app.modules.auth.provider import CurrentUser

router = APIRouter()

_OIDC_PENDING = "Flujo OIDC con Minerva pendiente de implementar (swap del SDK)."


@router.get("/me", response_model=CurrentUser)
async def me(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return user


@router.get("/permissions")
async def permissions(user: CurrentUser = Depends(get_current_user)) -> dict[str, list[str]]:
    settings = get_settings()
    if settings.AUTH_PROVIDER == "stub":
        # "*" = el stub concede todo; el SPA puede tratarlo como acceso total.
        return {"permissions": ["*"]}
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_OIDC_PENDING)


@router.get("/login")
async def login() -> RedirectResponse:
    settings = get_settings()
    if settings.AUTH_PROVIDER == "stub":
        return RedirectResponse(settings.FRONTEND_POST_LOGIN_URL)
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_OIDC_PENDING)


@router.get("/callback")
async def callback(request: Request) -> RedirectResponse:
    settings = get_settings()
    if settings.AUTH_PROVIDER == "stub":
        return RedirectResponse(settings.FRONTEND_POST_LOGIN_URL)
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_OIDC_PENDING)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> Response:
    settings = get_settings()
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
    # En modo minerva, además se revoca la sesión en Redis y el token en Minerva
    # durante el swap.
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
