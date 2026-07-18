# Guía de despliegue — Tablerillos

## Prerrequisitos

| Herramienta | Versión mínima | Nota |
|---|---|---|
| Docker | 24+ | Con BuildKit habilitado |
| Docker Compose | Plugin v2 (`docker compose`) | |
| Minerva | Cualquiera | Puede ser instancia local, de dev o producción |
| `GITHUB_TOKEN` | PAT con `read:packages` | Para instalar el `minerva-sdk` (repo privado) |

---

## Desarrollo local

### 1. Clonar y configurar variables de entorno

```bash
git clone <repo> tablerillos && cd tablerillos
cp .env.example .env
```

Edita `.env` y rellena al menos:

```env
# Cifrado de contraseñas de conexiones — OBLIGATORIO
# Generar con:
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
SECRET_ENCRYPTION_KEY=<clave-fernet>

# Cliente OIDC registrado en Minerva
MINERVA_CLIENT_ID=<client_id>
MINERVA_CLIENT_SECRET=<client_secret>

# URL de Minerva que ve el NAVEGADOR (localhost)
MINERVA_PUBLIC_ISSUER_URL=http://localhost:9000

# URL de Minerva que ve el BACKEND (dentro de Docker)
MINERVA_ISSUER_URL=http://host.docker.internal:9000
MINERVA_EXPECTED_ISSUER=http://localhost:9000
```

> **Dual-URL de Minerva:** el navegador y el backend corren en contextos de red distintos.
> El navegador accede a Minerva por `localhost:9000`; el backend (dentro del contenedor)
> lo alcanza por `host.docker.internal:9000`. No los mezcles.

### 2. Exportar el PAT de GitHub

El `minerva-sdk` es una dependencia base en un repo privado. Se instala durante el build
usando un secreto de BuildKit que **se lee del entorno del shell**, no del `.env`.

```bash
# Exporta todo el .env al shell Y el token de GitHub
set -a && . ./.env && set +a
export GITHUB_TOKEN=ghp_tuPAT...
```

### 3. Levantar el stack

```bash
docker compose -f infra/docker-compose.yml up --build
```

Al arrancar el backend ejecuta automáticamente `alembic upgrade head` antes de uvicorn.

| Servicio | Puerto local |
|---|---|
| Frontend (Vite) | http://localhost:5173 |
| Backend (FastAPI + Swagger) | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6380 |

> Redis expone el puerto **6380** en el host (no 6379) para no colisionar con el Redis
> local que puede estar usando Minerva.

### 4. Importar el manifiesto de Minerva

Los permisos y roles de Tablerillos se declaran en `manifest.minerva.yml`. Minerva
importa automáticamente los manifiestos que coloca en su carpeta `manifests/` al arrancar
(si `MINERVA_AUTO_IMPORT_MANIFESTS=true`, que es el default en dev).

Alternativa manual:

```bash
./infra/scripts/import-manifest.sh
# o directamente:
curl -X POST http://localhost:9000/api/v1/manifests/import \
  -H "Authorization: Bearer <admin_token>" \
  -F "file=@manifest.minerva.yml"
```

### 5. Desarrollo sin Docker (backend)

```bash
cd backend
conda activate tab           # entorno conda con Python 3.12
pip install -e ".[dev]"      # requiere GITHUB_TOKEN en el env
cp .env.example .env         # ajustar DATABASE_URL y REDIS_URL a localhost

alembic upgrade head
uvicorn app.main:app --reload
```

> Todos los comandos Python del backend corren en el entorno conda `tab`.
> Usar `conda run -n tab <cmd>` para no activar el entorno interactivamente.

### 6. Desarrollo sin Docker (frontend)

```bash
cd frontend
npm install
npm run dev     # Vite en :5173, proxya /api a localhost:8000
```

---

## Comandos de desarrollo frecuentes

```bash
# Backend
conda run -n tab pytest                        # todos los tests
conda run -n tab pytest app/tests/test_x.py   # un archivo
conda run -n tab ruff check .                  # lint
conda run -n tab ruff format .                 # formato
conda run -n tab mypy app                      # tipos

# Alembic
conda run -n tab alembic upgrade head          # aplicar migraciones
conda run -n tab alembic revision --autogenerate -m "descripcion"  # nueva migración

# Frontend
npm run dev      # servidor de desarrollo
npm run build    # build de producción (tsc + vite)
npm run lint     # eslint
npm run test     # vitest
```

---

## Producción

El stack de producción vive en **`infra/docker-compose.prod.yml`** y expone un único
puerto (`HTTP_PORT`, default 8080): un nginx que sirve el SPA compilado y hace proxy de
`/api` al backend. Así todo es **same-origin** y la cookie BFF `tb_session` funciona sin
CORS.

```
proxy institucional (TLS) ──► nginx :HTTP_PORT ──► estáticos del SPA
                                   └── /api ────► backend :8000 (uvicorn, 4 workers)
                                                     └── postgres / redis (red interna)
```

### Despliegue paso a paso

```bash
# 1. .env de producción (ver .env.example; config.py corta el arranque si
#    quedan placeholders con ENVIRONMENT=production)
cp .env.example .env
#    ENVIRONMENT=production, DEBUG=false, SECRET_ENCRYPTION_KEY real,
#    POSTGRES_PASSWORD real, URLs https de Minerva y
#    MINERVA_REDIRECT_URI=https://<dominio>/api/auth/callback

# 2. PAT para el minerva-sdk (secreto de BuildKit, se lee del shell)
set -a && . ./.env && set +a
export GITHUB_TOKEN=ghp_...

# 3. Levantar (las migraciones corren automáticamente al arrancar)
docker compose -f infra/docker-compose.prod.yml up -d --build

# 4. Verificar
curl http://localhost:${HTTP_PORT:-8080}/health
# → {"status":"ok","components":{"database":"ok","redis":"ok"}}
```

### TLS

El nginx del stack escucha **HTTP plano**: la terminación TLS la hace el proxy
institucional aguas arriba, que debe reenviar `X-Forwarded-Proto: https` (el nginx del
stack ya propaga ese header al backend, y uvicorn corre con `--proxy-headers`). La cookie
sale `Secure` por `ENVIRONMENT=production`, no por el esquema local.

### Actualizar

```bash
git pull
set -a && . ./.env && set +a
docker compose -f infra/docker-compose.prod.yml up -d --build
```

### Respaldos

Lo único con estado es el volumen `postgres_data` (metadata: conexiones cifradas,
datasets, gráficas, dashboards) — respaldar con `pg_dump` programado:

```bash
docker compose -f infra/docker-compose.prod.yml exec postgres \
  pg_dump -U tablerillos tablerillos > backup_$(date +%F).sql
```

Redis solo guarda sesiones y caché: se puede perder sin daño (los usuarios vuelven a
iniciar sesión). El `.env` (en particular `SECRET_ENCRYPTION_KEY`) debe respaldarse en el
secret manager: sin la clave, las contraseñas de las conexiones son irrecuperables.

### Manifiesto en Minerva productiva

Importar `manifest.minerva.yml` contra la Minerva de producción (mismo procedimiento que
en dev, con el token de admin de esa instancia) **antes** del primer login, para que los
permisos `tablerillos.*` existan.

### Variables de entorno adicionales para producción

```env
ENVIRONMENT=production
DEBUG=false

# URLs reales (HTTPS)
MINERVA_ISSUER_URL=https://minerva.iieg.gob.mx
MINERVA_PUBLIC_ISSUER_URL=https://minerva.iieg.gob.mx
MINERVA_EXPECTED_ISSUER=https://minerva.iieg.gob.mx
MINERVA_REDIRECT_URI=https://tablerillos.iieg.gob.mx/api/auth/callback
FRONTEND_POST_LOGIN_URL=https://tablerillos.iieg.gob.mx/admin

# CORS — solo el dominio real
CORS_ALLOW_ORIGINS=https://tablerillos.iieg.gob.mx

# Session cookie se marca como Secure automáticamente cuando ENVIRONMENT=production
SESSION_COOKIE_NAME=tb_session
SESSION_TTL_SECONDS=86400
```

### Diferencias clave dev → producción

| Aspecto | Dev | Producción |
|---|---|---|
| Cookie `tb_session` | `Secure=false` | `Secure=true` (HTTPS obligatorio) |
| `DEBUG` | `true` (SQL en logs) | `false` |
| Minerva `VERIFY_AUD` | puede ser `false` para pruebas | `true` |
| `MINERVA_EXPECTED_ISSUER` | puede ser laxo | fijado al issuer HTTPS real |
| `SECRET_ENCRYPTION_KEY` | `.env` local | secret manager (nunca en el repo) |
| `MINERVA_CLIENT_SECRET` | `.env` local | secret manager |
| Manifiesto | auto-import al arrancar | importar explícitamente vía CI en el deploy |
| Migraciones | automáticas al arrancar | automáticas al arrancar (igual que dev) |

### Recomendaciones de seguridad

- `SECRET_ENCRYPTION_KEY` y `MINERVA_CLIENT_SECRET` deben ir en un **secret manager** (Vault, AWS Secrets Manager, etc.), nunca en el repositorio ni en variables de entorno sin cifrar en el servidor.
- Si se pierde o rota `SECRET_ENCRYPTION_KEY`, las contraseñas cifradas de todas las `Connection` se vuelven indescriptables — planear la rotación antes de cambiarla.
- Usar un usuario PostgreSQL **de solo lectura** para las conexiones registradas por los usuarios, separado del usuario de metadata de Tablerillos.
- HTTPS con TLS 1.2+ en todos los servicios expuestos.
- Nginx o Caddy como reverse proxy (terminación TLS, headers de seguridad, rate limiting).

---

## Lecciones aprendidas: beta con Minerva coubicada en el mismo host

Escenario: Tablerillos y Minerva corriendo como dos stacks Docker independientes en el
mismo servidor, ambos alcanzables desde la red institucional por una IP privada (no
`localhost`, no `host.docker.internal` desde fuera). Esto expone gotchas que no aparecen
ni en dev puro (todo en `localhost`) ni en producción con dominios HTTPS reales.

### El dual-URL se vuelve más estricto, no menos

Con Minerva en el mismo host, es tentador usar la misma IP:puerto para
`MINERVA_ISSUER_URL` y `MINERVA_PUBLIC_ISSUER_URL` — total, "es la misma máquina". **No
funciona**: el contenedor del backend de Tablerillos no puede alcanzar la IP privada
"externa" de su propio host (hairpin NAT no soportado por el gateway) aunque cualquier
otra máquina de la red sí pueda. El backend necesita `http://host.docker.internal:<puerto
de Minerva>`; solo el navegador debe usar la IP privada real.

```env
MINERVA_PUBLIC_ISSUER_URL=http://10.13.23.126:8080   # navegador
MINERVA_ISSUER_URL=http://host.docker.internal:8080  # backend (server-to-server)
```

Síntoma si se equivoca: `/api/auth/login` redirige bien (eso lo arma el navegador), pero
`/api/auth/callback` revienta con 502 y "Error al canjear el código con Minerva" — el
canje de código es la primera llamada server-to-server, y es ahí donde el hairpin NAT
tumba la conexión (timeout, no un error de Minerva).

**Corolario:** fijar `MINERVA_EXPECTED_ISSUER` explícitamente al valor público (el mismo
`iss` que Minerva realmente graba en el JWT, ver su propio `.well-known/openid-configuration`
o su env `MINERVA_JWT_ISSUER`). Si se deja sin definir y el SDK cae por default a
`MINERVA_ISSUER_URL`, quedaría esperando `host.docker.internal` como issuer — un valor que
nunca va a matchear el `iss` real del token.

### Diagnóstico: no confíes en `ping`/`curl` desde el propio host para validar una IP

Si `curl` a la IP privada que te dieron para Minerva da timeout **desde el mismo host
donde corre Minerva**, no concluyas que la IP está mal — es exactamente el síntoma de
hairpin NAT (el host no puede alcanzarse a sí mismo por su IP "externa"). La fuente de
verdad es el propio servicio: pega su `/.well-known/openid-configuration` (`issuer`,
`authorization_endpoint`) y usa esos valores tal cual. Confirmar además desde una tercera
máquina de la red si es posible.

### `docker restart` no recarga `.env`

`docker restart <contenedor>` reinicia el proceso con el entorno con el que el
contenedor fue **creado**; no relee `env_file` ni variables nuevas. Después de editar
`.env` hay que recrear el contenedor:

```bash
set -a && . ./.env && set +a
docker compose -f infra/docker-compose.yml up -d backend   # recrea, no solo reinicia
```

### `manifest.minerva.yml` debe listar TODOS los `redirect_uris`, no solo el de dev

El archivo es la fuente de verdad versionada; reimportarlo actualiza los metadatos de la
aplicación en Minerva (a diferencia de permisos/roles, que solo se agregan, nunca se
borran). Si el redirect_uri del beta se agrega manualmente en el panel de Minerva pero
`manifest.minerva.yml` solo lista `localhost`, un reimport futuro (el paso documentado de
despliegue a producción) lo puede pisar y tumbar el login del beta sin previo aviso.
Agregar cada entorno como una entrada adicional en la lista, nunca reemplazar:

```yaml
redirect_uris:
  - http://localhost:8000/api/auth/callback
  - http://10.13.23.126:8000/api/auth/callback  # beta
```

### Bug observado en Minerva: seed de admin no es a prueba de multi-worker

Con `gunicorn -w 4`, cada worker corre el startup de FastAPI de forma independiente. El
seed del usuario admin hace un SELECT-then-INSERT sin lock ni `ON CONFLICT`: si más de un
worker arranca en la ventana de la carrera, todos pasan el SELECT (nadie ve el admin
todavía), varios intentan el INSERT, el que pierde revienta con `UniqueViolation`, y
gunicorn trata cualquier fallo de arranque de worker como fatal (`HaltServer`, tumba el
proceso completo). Es intermitente, no reproducible siempre — puede arrancar bien 10
veces y fallar la 11. Recuperación: reintentar el arranque (`docker compose up -d
backend` de nuevo) suele resolver la carrera. Esto es un bug del lado de Minerva, no de
Tablerillos; vale la pena reportarlo a quien mantiene ese repo.
