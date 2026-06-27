# Módulo: Auth

**Ruta backend:** `backend/app/modules/auth/`  
**Endpoints:** `/api/auth/*`  
**Estado:** Implementado ✅

---

## Responsabilidad

Maneja todo el ciclo de vida de autenticación y autorización usando Minerva como único proveedor de identidad. Implementa el patrón **BFF (Backend-For-Frontend)**: el backend es el único que posee tokens; el navegador solo recibe una cookie de sesión opaca.

No existe identidad local: no hay tablas de usuarios, contraseñas ni roles propios. Minerva suple todo eso.

---

## Archivos

| Archivo | Rol |
|---|---|
| `models.py` | `CurrentUser` — modelo Pydantic con los claims del usuario autenticado |
| `oidc.py` | Helpers del flujo OIDC: PKCE, canje de código, revocación |
| `session.py` | `SessionStore` — wrapper sobre Redis para sesiones y estado OIDC |
| `minerva.py` | Integración con el `minerva-sdk`: validación de token, resolución de permisos |
| `deps.py` | Dependencies de FastAPI: `get_current_user`, `require_app_access`, `require_permission` |
| `router.py` | Endpoints: `/login`, `/callback`, `/logout`, `/me` |

---

## Flujo de login

```
1. GET /api/auth/login
   ├── Genera code_verifier (PKCE, 32 bytes aleatorios)
   ├── Deriva code_challenge = BASE64URL(SHA256(verifier))
   ├── Genera state (anti-CSRF) y nonce
   ├── Guarda {code_verifier, nonce} en Redis bajo oidc:{state} (TTL=300s)
   └── Redirige al navegador a Minerva /auth/authorize con todos los parámetros

2. GET /api/auth/callback?code=...&state=...
   ├── Verifica que state exista en Redis (anti-CSRF)
   ├── Recupera code_verifier y borra la clave oidc:{state}
   ├── Canjea el código con Minerva (POST /auth/token, server-to-server)
   ├── Guarda {access_token, refresh_token} en Redis bajo session:{sid} (TTL=24h)
   ├── Crea cookie tb_session=sid (httpOnly, SameSite=lax, Secure en prod)
   └── Redirige al frontend (FRONTEND_POST_LOGIN_URL)

3. POST /api/auth/logout
   ├── Lee sid de la cookie
   ├── Revoca el refresh_token en Minerva (RFC 7009)
   ├── Borra la clave session:{sid} de Redis
   └── Elimina la cookie tb_session
```

---

## Validación de identidad por request

Cada endpoint protegido usa `get_current_user` como dependency:

```
request llega con cookie tb_session
    │
    ├── minerva.py: _access_token() lee sid → busca en Redis → devuelve access_token
    │
    └── minerva.py: resolve_user() pasa el token al minerva-sdk
            │
            └── SDK: verifica firma RS256 contra JWKS de Minerva (con caché)
                      extrae claims: sub, email, name, roles
                      devuelve CurrentUser
```

**El `minerva-sdk` nunca recibe el secreto del cliente** — la validación de firma usa el JWKS público de Minerva (asimétrico RS256). Solo el canje del código usa el `client_secret`.

---

## Gate de acceso por rol

`require_app_access` (en `deps.py`) es la primera barrera antes de los permisos finos:

```python
user = await get_current_user(request)
if not user.roles:
    raise HTTPException(403, "Sin rol asignado en Tablerillos")
```

`roles` proviene del claim `roles` del access_token, que Minerva calcula al emitirlo basándose en los roles asignados al usuario **en la aplicación `tablerillos`**. Tener una cuenta en Minerva no es suficiente para entrar al panel.

---

## Permisos finos

`require_permission("tablerillos.connections.view")` crea una dependency de FastAPI que:

1. Llama a `minerva.assert_permission(request, user, permission)`.
2. El SDK consulta `GET /api/v1/me/permissions?application=tablerillos` en Minerva con el `access_token` del usuario (con caché corta, propagación de revocación).
3. Si Minerva responde que el usuario no tiene el permiso → 403.

**Nunca** se comparan roles localmente. La decisión de autorización siempre la toma Minerva.

Los permisos disponibles se declaran en `manifest.minerva.yml` en la raíz del repo.

---

## Tests

`app/tests/conftest.py` sobreescribe las dependencies de auth con `dependency_overrides`:

```python
TEST_USER = CurrentUser(sub="test-user", email="test@iieg.test", name="Test", roles=["tester"])
minerva.assert_permission = async_noop   # no llama al SDK
fastapi_app.dependency_overrides[get_current_user] = lambda: TEST_USER
```

Este es el **único** lugar donde existe un mock de auth. El resto del código no tiene banderas ni modos alternativos.

---

## CurrentUser

```python
class CurrentUser(BaseModel):
    sub: str              # identificador único en Minerva
    email: str | None
    name: str | None
    roles: list[str]      # slugs de roles en tablerillos (vacío = sin acceso)
```

`created_by` en las tablas almacena `user.sub`; `created_by_email` almacena `user.email` para legibilidad.

---

## Uso desde otros módulos

```python
# Siempre importar desde deps.py, nunca desde minerva.py ni del SDK directamente
from app.modules.auth.deps import get_current_user, require_permission, require_app_access
from app.modules.auth.models import CurrentUser

@router.get("/algo")
def mi_endpoint(
    user: CurrentUser = Depends(require_permission("tablerillos.algo.view")),
):
    ...
```

---

## Variables de entorno relevantes

| Variable | Descripción |
|---|---|
| `MINERVA_ISSUER_URL` | URL de Minerva que ve el **backend** (dentro del contenedor) |
| `MINERVA_PUBLIC_ISSUER_URL` | URL de Minerva que ve el **navegador** |
| `MINERVA_APPLICATION_CODE` | `tablerillos` — identifica la app ante Minerva |
| `MINERVA_CLIENT_ID` | Obtenido al registrar la app en Minerva |
| `MINERVA_CLIENT_SECRET` | Solo para clientes confidenciales |
| `MINERVA_REDIRECT_URI` | Debe coincidir exactamente con el registrado en Minerva |
| `MINERVA_VERIFY_AUD` | `true` en producción — exige `aud=tablerillos` en el token |
| `MINERVA_EXPECTED_ISSUER` | Valida el claim `iss` del token |
| `MINERVA_JWKS_CACHE_TTL` | Segundos de caché del JWKS (default 3600) |
| `MINERVA_PERMISSIONS_CACHE_TTL` | Segundos de caché de permisos (default 300) |
| `SESSION_COOKIE_NAME` | `tb_session` |
| `SESSION_TTL_SECONDS` | TTL de la sesión en Redis (default 86400 = 24h) |
| `FRONTEND_POST_LOGIN_URL` | A dónde redirigir al usuario tras el login |
