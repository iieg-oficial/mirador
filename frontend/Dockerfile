# Multi-stage: `dev` (Vite dev server, usado por infra/docker-compose.yml) y
# `prod` (build estático servido por nginx, usado por docker-compose.prod.yml).

FROM node:22-slim AS dev

WORKDIR /app

# Instala dependencias primero para aprovechar la caché de capas.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ── Build de producción ───────────────────────────────────────────────────────

FROM dev AS build
RUN npm run build

FROM nginx:1.27-alpine AS prod
# La config de nginx (proxy /api, fallback SPA) se monta desde infra/nginx/
# en el compose de producción; aquí solo van los estáticos.
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
