import { useQuery } from '@tanstack/react-query'
import { listCharts } from '@/features/charts/api'
import { CHART_TYPE_LABELS } from '@/types/charts'
import type { Chart } from '@/types/charts'

interface Props {
  onPick: (chart: Chart) => void
  onClose: () => void
}

export function ChartPickerModal({ onPick, onClose }: Props) {
  const { data: charts = [], isLoading } = useQuery({ queryKey: ['charts'], queryFn: listCharts })
  const available = charts.filter((c) => c.status !== 'archived')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <p className="text-sm font-semibold text-gray-900">Agregar gráfica</p>
          <button onClick={onClose} className="text-lg leading-none text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {isLoading && <p className="p-4 text-sm text-gray-400">Cargando…</p>}
          {!isLoading && available.length === 0 && (
            <p className="p-4 text-sm text-gray-400">No hay gráficas disponibles.</p>
          )}
          {available.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-gray-100 px-3 py-2 text-left hover:border-iieg-300 hover:bg-iieg-50"
            >
              <span className="text-sm font-medium text-gray-800">{c.name}</span>
              <span className="text-xs text-gray-400">{CHART_TYPE_LABELS[c.chart_type]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
