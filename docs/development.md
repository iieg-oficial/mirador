# Desarrollo — Tablerillos

> Stub inicial (Fase 0).

## Requisitos

- Docker + docker compose
- (Local sin Docker) Python 3.12+, Node 22+, PostgreSQL 16 + PostGIS, Redis
- Una instancia de **Minerva** accesible (dev: `localhost:9000`)

## Arranque rápido (Docker)

```bash
cp .env.example .env            # ajusta credenciales y datos de Minerva
# Genera la clave de cifrado de conexiones:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Pégala en SECRET_ENCRYPTION_KEY del backend/.env

docker compose -f infra/docker-compose.yml up --build
```

- Backend: http://localhost:8000 (health en `/health`, docs en `/docs`)
- Frontend: http://localhost:5173

## Registro en Minerva

1. Importa el manifiesto:
   ```bash
   MINERVA_ADMIN_TOKEN=<token> ./infra/scripts/import-manifest.sh
   ```
2. Guarda el `client_id` / `client_secret` devueltos en tu `.env`
   (`MINERVA_CLIENT_ID` / `MINERVA_CLIENT_SECRET`).

## Estado actual

Fase 0 (andamiaje). El backend expone solo `/health`; el frontend muestra un
placeholder. Los módulos se implementan en fases siguientes (ver el plan).
