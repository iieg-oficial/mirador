# Autenticación y autorización con Minerva

Tablerillos **no** implementa login, usuarios, roles ni permisos localmente.
Todo eso se delega a **Minerva**, el IdP institucional del IIEG, vía OIDC
(Authorization Code + PKCE). La autorización la decide Minerva en tiempo real;
**nunca** se comparan roles localmente.

## Modelo elegido: BFF confidencial

El backend FastAPI actúa como **Backend-For-Frontend**. El navegador nunca ve
los tokens (`access_token`, `id_token`, `refresh_token`); solo maneja una cookie
de sesión `httpOnly` respaldada en Redis.

Razones:
- El `refresh_token` de Minerva tiene rotación con detección de reuso; mantenerlo
  server-side evita exponerlo a XSS y simplifica la rotación atómica.
- El canje de código se hace servidor-a-servidor con `client_secret`, que nunca
  toca el browser.

## Flujo

1. SPA → `GET /api/auth/login` (redirección de navegador, no fetch).
2. Backend genera `code_verifier`, `state`, `nonce`; los guarda en Redis;
   redirige a `{MINERVA_PUBLIC_ISSUER_URL}/auth/authorize`.
3. Minerva autentica y redirige a `MINERVA_REDIRECT_URI`
   (`http://localhost:8000/api/auth/callback`).
4. Backend valida `state`, canjea el código en `/auth/token`, valida el
   `id_token` (RS256 vía JWKS, `nonce`, `aud`), crea sesión en Redis, setea la
   cookie `tb_session` y redirige al SPA (`FRONTEND_POST_LOGIN_URL`).
5. Cada request del SPA lleva la cookie; un dependency resuelve la sesión y pasa
   el `access_token` al SDK (`require_permission`).

## Dual-URL hacia Minerva (punto de fricción)

Minerva corre fuera del compose, en el host. Hay dos perspectivas:

| Variable | Quién la usa | Valor dev |
|---|---|---|
| `MINERVA_PUBLIC_ISSUER_URL` | el **navegador** (redirect a `/auth/authorize`) | `http://localhost:9000` |
| `MINERVA_ISSUER_URL` | el **backend** (canje de token + JWKS) | `http://host.docker.internal:9000` |

## Permisos y roles

Declarados en [`manifest.minerva.yml`](../manifest.minerva.yml), convención
`tablerillos.{resource}.{action}`. Mapeos del manual: `read→view`,
`publish→authorize`, `review→approve`, `connections:test→connections.manage`.
"Enviar a revisión" lo hace el Editor con `tablerillos.dashboards.update`
(cambia estado a `in_review`).

## Identidad sin tabla de usuarios local

`created_by` guarda el `sub` de Minerva (+ `created_by_email` para legibilidad).
Tabla espejo opcional `user_profiles` (no autoritativa, solo para mostrar
nombres) que se actualiza por *upsert* en cada callback de login.
