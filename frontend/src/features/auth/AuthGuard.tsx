import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'

export function AuthGuard() {
  const { isPending, isAuthenticated } = useAuth()

  useEffect(() => {
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

  return <Outlet />
}
