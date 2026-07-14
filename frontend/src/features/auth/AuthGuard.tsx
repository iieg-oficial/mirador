import { useEffect } from 'react'
import { Outlet, useSearchParams } from 'react-router-dom'
import { useAuth } from './useAuth'
import { AccessDenied } from './AccessDenied'
import { AuthError } from './AuthError'

export function AuthGuard() {
  const { isPending, isAuthenticated, hasAccess } = useAuth()
  const [searchParams] = useSearchParams()
  // El callback del backend redirige aquí con ?error=... en vez de responder
  // JSON crudo. access_denied = sin rol en la app (Minerva niega antes de dar
  // sesión). Cualquier otro = fallo del flujo OIDC (auth_failed). En ambos
  // casos NO se reintenta el login en bucle: se muestra una pantalla de error.
  const errorParam = searchParams.get('error')
  const deniedAtLogin = errorParam === 'access_denied'
  const authError = !!errorParam && !deniedAtLogin

  useEffect(() => {
    // Sin sesión → al login de Minerva. (Con sesión pero sin rol, o negado por
    // Minerva, NO redirige: reloguear no daría acceso; se muestra "sin acceso").
    if (!isPending && !isAuthenticated && !deniedAtLogin && !authError) {
      window.location.href = '/api/auth/login'
    }
  }, [isPending, isAuthenticated, deniedAtLogin, authError])

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-iieg-100 border-t-iieg-700" />
      </div>
    )
  }

  if (deniedAtLogin) return <AccessDenied />

  if (authError) return <AuthError />


  if (!isAuthenticated) return null

  // Autenticado en Minerva pero sin rol asignado en Tablerillos.
  if (!hasAccess) return <AccessDenied />

  return <Outlet />
}
