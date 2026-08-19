# Recetas del monorepo. `just` sin argumentos lista todo.
# Los comandos de Python corren en el entorno conda `tab`.

set dotenv-load := true

compose := "docker compose -f infra/docker-compose.yml"
py      := "conda run -n tab --no-capture-output"

default:
    @just --list

# --- Stack ---

# Levanta el stack completo (backend :8000, frontend :5173)
up:
    {{compose}} up --build -d
    @echo "backend http://localhost:8000/docs  ·  frontend http://localhost:5173"

# Tumba el stack (agrega `just down -v` para borrar volúmenes)
down *args:
    {{compose}} down {{args}}

# Reinicia un servicio (backend, frontend, postgres, redis)
restart svc:
    {{compose}} restart {{svc}}

# Logs en vivo; `just logs backend` para uno solo
logs *svc:
    {{compose}} logs -f {{svc}}

# Estado de los contenedores
ps:
    {{compose}} ps

# Shell dentro de un servicio
sh svc="backend":
    {{compose}} exec {{svc}} bash

# Health check del backend
health:
    curl -s localhost:8000/health | python -m json.tool

# --- Backend ---

lint:
    cd backend && {{py}} ruff check .

fmt:
    cd backend && {{py}} ruff format .

types:
    cd backend && {{py}} mypy app

# `just test` todo, `just test app/tests/test_x.py::test_y` uno solo
test *args:
    cd backend && {{py}} pytest {{args}}

migrate:
    cd backend && {{py}} alembic upgrade head

revision msg:
    cd backend && {{py}} alembic revision --autogenerate -m "{{msg}}"

# --- Frontend ---

dev:
    cd frontend && npm run dev

# Type-check estricto + build: la verificación real del frontend hoy
build:
    cd frontend && npm run build

# --- Todo junto ---

# Lo que corre CI: lint, tipos, tests y build del frontend
check: lint types test build
