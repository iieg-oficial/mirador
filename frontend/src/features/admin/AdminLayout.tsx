import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { queryClient } from '@/app/providers'

interface NavItem {
  to: string
  label: string
  end?: boolean
  disabled?: boolean
  icon: ReactNode
}

const NAV_MAIN: NavItem[] = [
  {
    to: '/admin',
    label: 'Inicio',
    end: true,
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    ),
  },
  {
    to: '/admin/conexiones',
    label: 'Conexiones',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    ),
  },
  {
    to: '/admin/datasets',
    label: 'Datasets',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    ),
  },
  {
    to: '/admin/graficas',
    label: 'Gráficas',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    ),
  },
  {
    to: '/admin/tableros',
    label: 'Tableros',
    disabled: true,
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    ),
  },
  {
    to: '/admin/publicacion',
    label: 'Publicación',
    disabled: true,
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    ),
  },
]

const NAV_SECONDARY: NavItem[] = [
  {
    to: '/admin/usuarios',
    label: 'Usuarios',
    disabled: true,
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    ),
  },
  {
    to: '/admin/configuracion',
    label: 'Configuración',
    disabled: true,
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    ),
  },
]

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  queryClient.clear()
  window.location.href = '/'
}

function NavItemEl({ item }: { item: NavItem }) {
  const base = 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors'

  if (item.disabled) {
    return (
      <div className={`${base} cursor-not-allowed text-white/25`}>
        <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {item.icon}
        </svg>
        <span>{item.label}</span>
      </div>
    )
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `${base} ${
          isActive
            ? 'bg-white/[0.15] font-semibold text-white'
            : 'text-white/65 hover:bg-white/[0.08] hover:text-white/90'
        }`
      }
    >
      <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {item.icon}
      </svg>
      {item.label}
    </NavLink>
  )
}

export function AdminLayout() {
  const { user } = useAuth()

  const initials = user?.name
    ? user.name
        .split(' ')
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'U'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-60 flex-shrink-0 flex-col bg-[#1e0a35] text-white">
        {/* Logo y título */}
        <div className="px-5 pb-4 pt-5">
          <img src="/logo_blanco_iieg.png" alt="IIEG Jalisco" className="h-10 w-auto" />
          <div className="mt-3">
            <p className="text-base font-bold leading-tight text-white">Tablerillos</p>
            <p className="text-xs text-white/45">Datos municipales de Jalisco</p>
          </div>
        </div>

        {/* Navegación principal */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-0.5">
            {NAV_MAIN.map((item) => (
              <NavItemEl key={item.to} item={item} />
            ))}
          </div>

          <div className="my-3 border-t border-white/[0.08]" />

          <div className="space-y-0.5">
            {NAV_SECONDARY.map((item) => (
              <NavItemEl key={item.to} item={item} />
            ))}
          </div>
        </nav>

        {/* Usuario */}
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-iieg-600 text-xs font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-white">
                {user?.name ?? 'Usuario'}
              </p>
              <p className="truncate text-xs text-white/45">{user?.email ?? user?.sub}</p>
            </div>
            <svg className="h-4 w-4 flex-shrink-0 text-white/35" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <button
            onClick={logout}
            className="mt-2 flex w-full items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-1.5 text-left text-xs text-white/55 transition-colors hover:border-white/25 hover:text-white/80"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
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
