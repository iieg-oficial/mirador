import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'

interface StatCard {
  label: string
  value: string
  description: string
  available: boolean
}

const STATS: StatCard[] = [
  { label: 'Conexiones', value: '—', description: 'Bloque C implementado', available: true },
  { label: 'Datasets', value: '—', description: 'Próximamente', available: false },
  { label: 'Gráficas', value: '—', description: 'Próximamente', available: false },
  { label: 'Tableros publicados', value: '—', description: 'Próximamente', available: false },
]

interface QuickAction {
  to: string
  title: string
  description: string
  available: boolean
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    to: '/admin/conexiones',
    title: 'Conexiones',
    description: 'Registra, edita y prueba conexiones a bases de datos externas.',
    available: true,
  },
  {
    to: '/admin/datasets',
    title: 'Datasets',
    description: 'Define consultas SQL sobre las conexiones registradas.',
    available: false,
  },
  {
    to: '/admin/graficas',
    title: 'Gráficas',
    description: 'Crea visualizaciones D3 a partir de los datasets disponibles.',
    available: false,
  },
  {
    to: '/admin/tableros',
    title: 'Tableros',
    description: 'Compone y publica dashboards con las gráficas creadas.',
    available: false,
  },
]

export function AdminHome() {
  const { user } = useAuth()

  const greeting = user?.name ? `, ${user.name}` : ''

  return (
    <div className="p-8">
      {/* Encabezado */}
      <div className="mb-8 border-b border-gray-200 pb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bienvenido{greeting}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Panel de administración · Tablerillos IIEG Jalisco
        </p>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATS.map(({ label, value, description, available }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p
              className={`text-3xl font-bold ${
                available ? 'text-iieg-700' : 'text-gray-200'
              }`}
            >
              {value}
            </p>
            <p className="mt-1 text-sm font-medium text-gray-700">{label}</p>
            <p className="mt-0.5 text-xs text-gray-400">{description}</p>
          </div>
        ))}
      </div>

      {/* Cadena de datos */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Cadena de datos
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map(({ to, title, description, available }) =>
            available ? (
              <Link
                key={to}
                to={to}
                className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-iieg-700 hover:shadow-md"
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-iieg-700 group-hover:text-iieg-600">
                    {title}
                  </h3>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-naranja-500 text-[10px] font-bold text-white">
                    →
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-gray-500">{description}</p>
              </Link>
            ) : (
              <div
                key={to}
                className="cursor-not-allowed rounded-xl border border-gray-100 bg-gray-50 p-5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-400">{title}</h3>
                  <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] text-gray-400">
                    pronto
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-gray-400">{description}</p>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  )
}
