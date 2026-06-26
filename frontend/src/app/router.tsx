import { createBrowserRouter } from 'react-router-dom'
import { PublicLayout } from '@/features/public/PublicLayout'
import { HomePage } from '@/features/public/HomePage'
import { AuthGuard } from '@/features/auth/AuthGuard'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { AdminHome } from '@/features/admin/AdminHome'

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [{ path: '/', element: <HomePage /> }],
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AdminLayout />,
        children: [{ path: '/admin', element: <AdminHome /> }],
      },
    ],
  },
])
