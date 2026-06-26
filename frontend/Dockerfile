FROM node:22-slim

WORKDIR /app

# Instala dependencias primero para aprovechar la caché de capas.
COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
