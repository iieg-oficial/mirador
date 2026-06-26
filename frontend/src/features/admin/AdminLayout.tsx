import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { queryClient } from '@/app/providers'

interface NavItem {
  to: string
  label: string
  end?: boolean
  disabled?: boolean
  badge?: string
  icon: ReactNode
}

const NAV: NavItem[] = [
  {
    to: '/admin',
    label: 'Inicio',
    end: true,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    ),
  },
  {
    to: '/admin/conexiones',
    label: 'Conexiones',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
      />
    ),
  },
  {
    to: '/admin/datasets',
    label: 'Datasets',
    disabled: true,
    badge: 'pronto',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    ),
  },
  {
    to: '/admin/graficas',
    label: 'Gráficas',
    disabled: true,
    badge: 'pronto',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
      />
    ),
  },
  {
    to: '/admin/tableros',
    label: 'Tableros',
    disabled: true,
    badge: 'pronto',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
      />
    ),
  },
]

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  queryClient.clear()
  window.location.href = '/'
}

export function AdminLayout() {
  const { user } = useAuth()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <aside className="flex w-56 flex-shrink-0 flex-col bg-iieg-700 text-white">
        {/* Cabecera del sidebar — logo IIEG */}
        <div className="border-b border-white/10 px-4 py-4">
          <img
            src="/logo_blanco_iieg.png"
            alt="IIEG Jalisco"
            className="h-8 w-auto"
          />
          <p className="mt-2 text-xs font-semibold text-white/60">Tablerillos</p>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((item) =>
            item.disabled ? (
              <div
                key={item.to}
                className="mb-0.5 flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2.5 text-sm text-white/25"
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {item.icon}
                </svg>
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-auto text-[9px] font-medium text-white/20">
                    {item.badge}
                  </span>
                )}
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `mb-0.5 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-white/20 font-semibold text-white border-l-2 border-naranja-500'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {item.icon}
                </svg>
                {item.label}
              </NavLink>
            ),
          )}
        </nav>

        {/* Usuario y cierre de sesión */}
        <div className="border-t border-white/10 px-4 py-4">
          {user?.name && (
            <p className="text-xs font-medium text-white/70 truncate">{user.name}</p>
          )}
          <p className="truncate text-xs text-white/40">{user?.email ?? user?.sub}</p>
          <button
            onClick={logout}
            className="mt-3 w-full rounded-md border border-white/20 px-2 py-1.5 text-left text-xs text-white/60 transition-colors hover:border-white/40 hover:text-white/90"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Área de contenido */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
