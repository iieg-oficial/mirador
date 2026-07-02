import { useAuth } from './useAuth'
import { queryClient } from '@/app/providers'

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  queryClient.clear()
  window.location.href = '/'
}

/**
 * Pantalla para usuarios autenticados en Minerva pero SIN rol asignado en
 * Tablerillos. Reloguear no resolvería nada (el acceso lo gestiona Minerva), así
 * que en vez de redirigir al login se explica el motivo y se ofrece salir o
 * volver al inicio público.
 */
export function AccessDenied() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-iieg-100">
          <svg className="h-7 w-7 text-iieg-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 15v2m0 0v.01M6 11V7a6 6 0 1112 0v4m-9 0h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2z"
            />
          </svg>
        </div>

        <h1 className="text-lg font-semibold text-gray-900">Sin acceso a Tablerillos</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Tu cuenta{user?.email ? <> (<span className="font-medium">{user.email}</span>)</> : null}{' '}
          inició sesión correctamente, pero no tiene un rol asignado en Tablerillos.
          Solicita acceso al administrador de Minerva para poder usar el panel.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <a
            href="/"
            className="rounded-md bg-iieg-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-iieg-600"
          >
            Volver al inicio
          </a>
          <button
            onClick={logout}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
