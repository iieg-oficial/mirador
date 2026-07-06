import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/useAuth'
import { listConexiones } from '@/features/connections/api'
import { listDatasets } from '@/features/datasets/api'
import { listCharts } from '@/features/charts/api'

interface StatCard {
  label: string
  iconPath: string
  value: string | number
  description: string
  to?: string
  available: boolean
}

interface QuickAction {
  to: string
  label: string
  iconPath: string
  available: boolean
}

const ICON_DB =
  'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4'
const ICON_FILE =
  'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
const ICON_CHART =
  'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z'
const QUICK_ACTIONS: QuickAction[] = [
  { to: '/admin/conexiones', label: 'Nueva conexión', iconPath: ICON_DB, available: true },
  { to: '/admin/datasets', label: 'Nuevo dataset', iconPath: ICON_FILE, available: true },
  { to: '/admin/graficas', label: 'Crear gráfica', iconPath: ICON_CHART, available: true },
]

function SvgIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg className={className ?? 'h-5 w-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={path} />
    </svg>
  )
}

export function AdminHome() {
  const { user } = useAuth()

  const { data: conexiones, isLoading: loadingConn } = useQuery({
    queryKey: ['conexiones'],
    queryFn: () => listConexiones(),
  })

  const { data: datasets, isLoading: loadingDs } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => listDatasets(),
  })

  const { data: charts, isLoading: loadingCharts } = useQuery({
    queryKey: ['charts'],
    queryFn: () => listCharts(),
  })

  const noArchivadas = conexiones?.filter((c) => c.status !== 'archivada') ?? []
  const activas = noArchivadas.filter((c) => c.status === 'activa').length
  const totalConn = noArchivadas.length
  const totalDs = datasets?.length ?? 0
  const totalCharts = charts?.length ?? 0

  const STATS: StatCard[] = [
    {
      label: 'Conexiones activas',
      iconPath: ICON_DB,
      value: loadingConn ? '…' : `${activas} / ${totalConn}`,
      description: 'Fuentes de datos disponibles',
      to: '/admin/conexiones',
      available: true,
    },
    {
      label: 'Datasets guardados',
      iconPath: ICON_FILE,
      value: loadingDs ? '…' : totalDs,
      description: 'Consultas SQL listas para graficar',
      to: '/admin/datasets',
      available: true,
    },
    {
      label: 'Gráficas creadas',
      iconPath: ICON_CHART,
      value: loadingCharts ? '…' : totalCharts,
      description: 'Visualizaciones en ECharts',
      to: '/admin/graficas',
      available: true,
    },
  ]

  return (
    <div className="min-h-full bg-white p-8">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bienvenido{user?.name ? `, ${user.name}` : ''}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Panel de administración · Tablerillos IIEG Jalisco
        </p>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="mt-8 grid grid-cols-4 gap-4">
        {STATS.map((s) => {
          const card = (
            <div
              className={`rounded-xl border p-5 shadow-sm transition-all ${
                s.available
                  ? 'border-gray-100 bg-white hover:border-iieg-200 hover:shadow'
                  : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div
                className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${
                  s.available ? 'bg-iieg-100' : 'bg-gray-100'
                }`}
              >
                <SvgIcon
                  path={s.iconPath}
                  className={`h-5 w-5 ${s.available ? 'text-iieg-600' : 'text-gray-400'}`}
                />
              </div>
              <p className={`text-3xl font-bold ${s.available ? 'text-gray-900' : 'text-gray-300'}`}>
                {s.value}
              </p>
              <p className={`mt-0.5 text-sm font-semibold ${s.available ? 'text-gray-700' : 'text-gray-400'}`}>
                {s.label}
              </p>
              <p className="mt-1 text-xs text-gray-400">{s.description}</p>
            </div>
          )

          return s.to && s.available ? (
            <Link key={s.label} to={s.to}>
              {card}
            </Link>
          ) : (
            <div key={s.label}>{card}</div>
          )
        })}
      </div>

      {/* Acciones rápidas */}
      <div className="mt-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Acciones rápidas</h2>
        <div className="grid grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((a) =>
            a.available ? (
              <Link
                key={a.label}
                to={a.to}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-gray-700 transition-colors hover:border-iieg-300 hover:bg-iieg-50 hover:text-iieg-700"
              >
                <SvgIcon path={a.iconPath} className="h-4 w-4 flex-shrink-0 text-iieg-500" />
                <span className="flex-1 text-xs font-medium">{a.label}</span>
                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : (
              <div
                key={a.label}
                className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 opacity-50"
              >
                <SvgIcon path={a.iconPath} className="h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="flex-1 text-xs font-medium text-gray-400">{a.label}</span>
                <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] text-gray-500">
                  pronto
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  )
}
