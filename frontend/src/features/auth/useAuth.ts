import { useQuery } from '@tanstack/react-query'
import type { CurrentUser } from '@/types/auth'

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const res = await fetch('/api/auth/me')
  if (res.status === 401) return null
  if (!res.ok) throw new Error('Error al verificar sesión')
  return res.json() as Promise<CurrentUser>
}

export function useAuth() {
  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  return {
    user: query.data ?? null,
    isPending: query.isPending,
    isAuthenticated: query.data != null,
  }
}
