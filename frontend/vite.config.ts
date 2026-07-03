import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El SPA y el backend comparten origen lógico en dev: todo /api se proxya al
// backend para que la cookie de sesión httpOnly (modelo BFF) funcione sin CORS.
// El alias @/ mapea a src/ para importaciones absolutas dentro del proyecto.
export default defineConfig({
  plugins: [react()],
  // react-draggable (usado por react-grid-layout para mover/redimensionar) hace
  // `if (process.env.DRAGGABLE_DEBUG)` en su handler de arrastre. En el navegador
  // `process` no existe → lanza "process is not defined" al iniciar el arrastre y
  // el ítem no se mueve ni se ajusta. Se reemplaza la expresión por `false`.
  define: {
    "process.env.DRAGGABLE_DEBUG": "false",
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    host: true,
    port: 5173,
    // En Docker sobre Linux el bind-mount no propaga eventos inotify al
    // contenedor: sin polling, Vite HMR no ve los cambios de código y sirve
    // un bundle viejo (cambios que "no aparecen" en el navegador).
    watch: { usePolling: true },
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_URL ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
