import { useEffect } from 'react'
import { Outlet, useSearchParams } from 'react-router-dom'
import { useAuth } from './useAuth'
import { AccessDenied } from './AccessDenied'

export function AuthGuard() {
  const { isPending, isAuthenticated, hasAccess } = useAuth()
  const [searchParams] = useSearchParams()
  // Minerva 0.2.0 niega el login (sin rol en la app) antes de dar sesión y
  // redirige aquí con ?error=access_denied. Sin este chequeo se reintentaría
  // el login en bucle: nunca habrá sesión, reloguear no cambia el rol.
  const deniedAtLogin = searchParams.get('error') === 'access_denied'

  useEffect(() => {
    // Sin sesión → al login de Minerva. (Con sesión pero sin rol, o negado por
    // Minerva, NO redirige: reloguear no daría acceso; se muestra "sin acceso").
    if (!isPending && !isAuthenticated && !deniedAtLogin) {
      window.location.href = '/api/auth/login'
    }
  }, [isPending, isAuthenticated, deniedAtLogin])

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-iieg-100 border-t-iieg-700" />
      </div>
    )
  }

  if (deniedAtLogin) return <AccessDenied />

  if (!isAuthenticated) return null

  // Autenticado en Minerva pero sin rol asignado en Tablerillos.
  if (!hasAccess) return <AccessDenied />

  return <Outlet />
}
