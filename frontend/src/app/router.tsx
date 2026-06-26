import { createBrowserRouter } from 'react-router-dom'
import { PublicLayout } from '@/features/public/PublicLayout'
import { HomePage } from '@/features/public/HomePage'
import { AuthGuard } from '@/features/auth/AuthGuard'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { AdminHome } from '@/features/admin/AdminHome'

export const router = createBrowserRouter([
  {
    // Área pública: "/" y cualquier futura página pública
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
    ],
  },
  {
    // Área admin: /admin y sub-rutas futuras
    // AuthGuard intercepta si no hay sesión → redirige a Minerva
    path: '/admin',
    element: <AuthGuard />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminHome /> },
        ],
      },
    ],
  },
])
