import React from "react";
import ReactDOM from "react-dom/client";

// Fase 0 (andamiaje): placeholder mínimo. En fases siguientes se montan aquí
// los providers (QueryClientProvider, RouterProvider) desde src/app/.
function App() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>Tablerillos</h1>
      <p>Business Intelligence institucional del IIEG — andamiaje inicial.</p>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
