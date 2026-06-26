import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El SPA y el backend comparten origen lógico en dev: todo /api se proxya al
// backend para que la cookie de sesión httpOnly (modelo BFF) funcione sin CORS.
// El alias @/ mapea a src/ para importaciones absolutas dentro del proyecto.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_URL ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
