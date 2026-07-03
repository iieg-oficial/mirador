// Un control de filtro global, renderizado según su control_type. Reporta las
// opciones resueltas hacia arriba (onOptions) para que el editor arme el
// contexto `{{ filter.* }}` de Markdown y los chips de filtros activos.

import { useEffect } from 'react'
import { useFilterOptions } from './useFilterOptions'
import type { DashboardFilter, FilterOption } from './dashboardFilters'

interface Props {
  filter: DashboardFilter
  value: unknown
  onChange: (value: unknown) => void
  onOptions?: (filterId: string, options: FilterOption[]) => void
}

const inputCls = 'rounded border border-gray-200 px-2 py-1 text-xs focus:border-iieg-400 focus:outline-none'

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

export function FilterControl({ filter, value, onChange, onOptions }: Props) {
  const needsOptions = filter.control_type === 'select' || filter.control_type === 'multiselect'
  const { options, isLoading } = useFilterOptions(filter)

  useEffect(() => {
    if (needsOptions) onOptions?.(filter.id, options)
  }, [needsOptions, filter.id, options, onOptions])

  const range = asArray(value)
  const setRange = (i: number, v: string) => {
    const next = [range[0] ?? '', range[1] ?? '']
    next[i] = v
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-gray-500">
        {filter.label}
        {filter.required && <span className="text-red-500"> *</span>}
      </label>

      {filter.control_type === 'select' && (
        <select
          value={value == null ? '' : String(value)}
          onChange={(e) => {
            const opt = options.find((o) => String(o.value) === e.target.value)
            onChange(opt ? opt.value : e.target.value || null)
          }}
          className={inputCls}
        >
          <option value="">{isLoading ? 'Cargando…' : '— Todos —'}</option>
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {filter.control_type === 'multiselect' && (
        <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded border border-gray-200 p-1">
          {isLoading && <span className="text-[11px] text-gray-400">Cargando…</span>}
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
      )}

      {filter.control_type === 'year' && (
        <input
          type="number"
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="Año"
          className={inputCls}
        />
      )}

      {filter.control_type === 'numrange' && (
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
      )}

      {filter.control_type === 'daterange' && (
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
      )}

      {filter.control_type === 'toggle' && (
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {filter.label}
        </label>
      )}

      {filter.control_type === 'text' && (
        <input
          type="text"
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || null)}
          className={inputCls}
        />
      )}
    </div>
  )
}
