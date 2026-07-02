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
