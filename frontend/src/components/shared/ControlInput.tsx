// Input presentacional para un control de valor (filtro de tablero o parámetro
// interactivo de una gráfica de código): mapea un tipo de control a su widget
// nativo. Sin estado propio ni fetch de opciones — eso lo resuelve quien lo usa
// (useFilterOptions para filtros de tablero, optionsForParam para params de
// gráfica) y se lo pasa ya resuelto en `options`.

import type { ControlType } from '@/features/dashboards/filters/dashboardFilters'
import type { ParamControl } from '@/types/charts'

export type AnyControlType = ControlType | ParamControl

export interface ControlOption {
  value: unknown
  label: string
}

interface Props {
  controlType: AnyControlType
  label: string
  value: unknown
  onChange: (value: unknown) => void
  options?: ControlOption[]
  optionsLoading?: boolean
  min?: number | null
  max?: number | null
  step?: number | null
}

const inputCls =
  'rounded border border-gray-200 px-2 py-1 text-xs focus:border-iieg-400 focus:outline-none focus:ring-1 focus:ring-iieg-400'

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

// 'year' (filtro de tablero) y 'number' (param de gráfica) son el mismo widget;
// igual 'toggle' y 'checkbox'. Se normaliza aquí para no duplicar ramas.
function normalize(t: AnyControlType): AnyControlType {
  if (t === 'year') return 'number'
  if (t === 'toggle') return 'checkbox'
  return t
}

export function ControlInput({
  controlType,
  label,
  value,
  onChange,
  options = [],
  optionsLoading = false,
  min,
  max,
  step,
}: Props) {
  const type = normalize(controlType)
  const range = asArray(value)
  const setRange = (i: number, v: string) => {
    const next = [range[0] ?? '', range[1] ?? '']
    next[i] = v
    onChange(next)
  }

  if (type === 'select') {
    return (
      <select
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value)
          onChange(opt ? opt.value : e.target.value || null)
        }}
        className={inputCls}
      >
        <option value="">{optionsLoading ? 'Cargando…' : '— Todos —'}</option>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }

  if (type === 'multiselect') {
    return (
      <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded border border-gray-200 p-1">
        {optionsLoading && <span className="text-[11px] text-gray-400">Cargando…</span>}
        {options.map((o) => {
          const checked = asArray(value).some((v) => String(v) === String(o.value))
          return (
            <label key={String(o.value)} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...asArray(value), o.value]
                      : asArray(value).filter((v) => String(v) !== String(o.value)),
                  )
                }
              />
              {o.label}
            </label>
          )
        })}
      </div>
    )
  }

  if (type === 'radio') {
    return (
      <div className="flex flex-col gap-0.5">
        {options.map((o) => (
          <label key={String(o.value)} className="flex items-center gap-1.5 text-xs">
            <input
              type="radio"
              checked={String(value) === String(o.value)}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    )
  }

  if (type === 'number') {
    return (
      <input
        type="number"
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        placeholder={controlType === 'year' ? 'Año' : undefined}
        min={min ?? undefined}
        max={max ?? undefined}
        step={step ?? undefined}
        className={inputCls}
      />
    )
  }

  if (type === 'slider') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="range"
          value={value == null ? (min ?? 0) : Number(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min ?? 0}
          max={max ?? 100}
          step={step ?? 1}
          className="w-full"
        />
        <span className="w-10 text-right text-[11px] text-gray-500">{value == null ? '—' : String(value)}</span>
      </div>
    )
  }

  if (type === 'numrange') {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={String(range[0] ?? '')}
          onChange={(e) => setRange(0, e.target.value)}
          placeholder="Mín"
          className={`${inputCls} w-full`}
        />
        <span className="text-gray-300">–</span>
        <input
          type="number"
          value={String(range[1] ?? '')}
          onChange={(e) => setRange(1, e.target.value)}
          placeholder="Máx"
          className={`${inputCls} w-full`}
        />
      </div>
    )
  }

  if (type === 'date') {
    return (
      <input
        type="date"
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputCls}
      />
    )
  }

  if (type === 'daterange') {
    return (
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={String(range[0] ?? '')}
          onChange={(e) => setRange(0, e.target.value)}
          className={`${inputCls} w-full`}
        />
        <span className="text-gray-300">–</span>
        <input
          type="date"
          value={String(range[1] ?? '')}
          onChange={(e) => setRange(1, e.target.value)}
          className={`${inputCls} w-full`}
        />
      </div>
    )
  }

  if (type === 'checkbox') {
    return (
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    )
  }

  // text
  return (
    <input
      type="text"
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value || null)}
      className={inputCls}
    />
  )
}
