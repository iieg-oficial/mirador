import { Link, Outlet } from 'react-router-dom'

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="bg-iieg-900 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-4">
          <Link to="/" className="flex items-center shrink-0">
            <img
              src="/logo_blanco_iieg.png"
              alt="IIEG — Instituto de Información Estadística y Geográfica de Jalisco"
              className="h-10 w-auto"
            />
          </Link>
          <div className="border-l border-white/20 pl-6 shrink-0">
            <span className="text-xl font-bold leading-none tracking-tight">Tablerillos</span>
            <span className="ml-2 text-xs text-white/50">Datos municipales de Jalisco</span>
          </div>

          <nav className="ml-auto flex items-center gap-6">
            <a href="#tableros" className="text-sm text-white/80 transition-colors hover:text-white">
              Explorar
            </a>
            <button className="flex items-center gap-1 text-sm text-white/80 transition-colors hover:text-white">
              Temas
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <a href="#" className="text-sm text-white/80 transition-colors hover:text-white">
              Indicadores
            </a>
            <a href="#" className="text-sm text-white/80 transition-colors hover:text-white">
              Acerca de
            </a>
            <Link
              to="/admin"
              className="flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:border-white/60 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              Iniciar sesión
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-iieg-950 text-white">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold">Tablerillos · Datos municipales de Jalisco</p>
              <p className="mt-1 text-sm text-white/50">
                Instituto de Información Estadística y Geográfica de Jalisco
              </p>
            </div>
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <nav className="flex gap-6 text-sm text-white/60">
                <a href="#" className="transition-colors hover:text-white">
                  Términos de uso
                </a>
                <a href="#" className="transition-colors hover:text-white">
                  Aviso de privacidad
                </a>
                <a href="#" className="transition-colors hover:text-white">
                  Contacto
                </a>
              </nav>
              <div className="flex gap-3">
                <a
                  href="#"
                  aria-label="Facebook"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>
                <a
                  href="#"
                  aria-label="X"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="#"
                  aria-label="YouTube"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
