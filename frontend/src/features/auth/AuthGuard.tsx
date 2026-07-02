import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'
import { AccessDenied } from './AccessDenied'

export function AuthGuard() {
  const { isPending, isAuthenticated, hasAccess } = useAuth()

  useEffect(() => {
    // Sin sesión → al login de Minerva. (Con sesión pero sin rol NO redirige:
    // reloguear no daría acceso; se muestra la pantalla "sin acceso").
    if (!isPending && !isAuthenticated) {
      window.location.href = '/api/auth/login'
    }
  }, [isPending, isAuthenticated])

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-iieg-100 border-t-iieg-700" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  // Autenticado en Minerva pero sin rol asignado en Tablerillos.
  if (!hasAccess) return <AccessDenied />

  return <Outlet />
}
