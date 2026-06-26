import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'

export function PublicLayout() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="bg-iieg-900 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-white/20 text-sm font-bold text-white">
              T
            </div>
            <div>
              <span className="block text-lg font-semibold leading-none">Tablerillos</span>
              <span className="block text-xs text-white/50">IIEG Jalisco</span>
            </div>
          </Link>
          {isAuthenticated ? (
            <Link
              to="/admin"
              className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20"
            >
              Ir al panel →
            </Link>
          ) : (
            <a
              href="/api/auth/login"
              className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20"
            >
              Iniciar sesión
            </a>
          )}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-gray-100 bg-gray-50 py-8">
        <div className="mx-auto max-w-7xl px-6 text-center text-sm text-gray-500">
          <p className="font-medium text-gray-700">
            Instituto de Información Estadística y Geográfica de Jalisco
          </p>
          <p className="mt-1">
            datos.iieg.gob.mx — Gobierno del Estado de Jalisco
          </p>
        </div>
      </footer>
    </div>
  )
}
