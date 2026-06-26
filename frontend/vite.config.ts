import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El SPA y el backend comparten origen lógico en dev: todo /api se proxya al
// backend para que la cookie de sesión httpOnly (modelo BFF) funcione sin CORS.
export default defineConfig({
  plugins: [react()],
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
