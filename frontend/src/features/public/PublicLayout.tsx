import { Link, Outlet } from 'react-router-dom'

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="bg-iieg-700 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center px-6 py-3">
          <Link to="/" className="flex items-center">
            <img
              src="/logo_blanco_iieg.png"
              alt="IIEG — Instituto de Información Estadística y Geográfica de Jalisco"
              className="h-10 w-auto"
            />
          </Link>
          <div className="ml-6 border-l border-white/20 pl-6">
            <span className="text-lg font-semibold leading-none tracking-tight">
              Tablerillos
            </span>
            <span className="ml-2 text-xs text-white/50">
              Datos municipales de Jalisco
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-gray-100 bg-gray-50 py-8">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <img
              src="/logo_gris_iieg.png"
              alt="IIEG"
              className="h-8 w-auto opacity-60"
            />
            <div className="text-center text-sm text-gray-500 sm:text-left">
              <p className="font-medium text-gray-600">
                Instituto de Información Estadística y Geográfica de Jalisco
              </p>
              <p className="mt-0.5">
                datos.iieg.gob.mx — Gobierno del Estado de Jalisco
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
