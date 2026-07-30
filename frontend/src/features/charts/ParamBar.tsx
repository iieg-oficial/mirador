// Barra de controles de una gráfica de código con parámetros declarados
// (ChartSpec.params). Puramente client-side: cambiar un valor no dispara ningún
// request, solo re-ejecuta el sandbox con `params` actualizado.

import { ControlInput } from '@/components/shared/ControlInput'
import { optionsForParam } from './params'
import type { ParamSpec } from '@/types/charts'

interface Props {
  params: ParamSpec[]
  values: Record<string, unknown>
  rows: Record<string, unknown>[]
  onChange: (id: string, value: unknown) => void
}

export function ParamBar({ params, values, rows, onChange }: Props) {
  if (params.length === 0) return null

  return (
    <div className="no-drag flex flex-wrap items-end gap-3 border-b border-gray-100 bg-white/90 px-2 py-1.5">
      {params.map((p) => (
        <div key={p.id} className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-gray-500">{p.label}</label>
          <ControlInput
            controlType={p.control}
            label={p.label}
            value={values[p.id]}
            onChange={(v) => onChange(p.id, v)}
            options={optionsForParam(p, rows)}
            min={p.min}
            max={p.max}
            step={p.step}
          />
        </div>
      ))}
    </div>
  )
}
