import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTag, listTags } from '@/features/tags/api'
import { TAG_COLORS, TAG_COLOR_CLASSES } from '@/types/tags'
import type { TagColor } from '@/types/tags'
import { TagBadge } from './TagBadge'
import { ErrorBanner } from './ErrorBanner'

interface Props {
  value: string[]
  onChange: (tagIds: string[]) => void
}

// Selector de etiquetas: checkboxes con scroll (mismo patrón que el
// multiselect de filtros de tableros, `FilterControl.tsx`) + alta rápida sin
// salir del formulario. No hay combobox reutilizable en el repo; no se
// introduce una librería nueva para esto.
export function TagPicker({ value, onChange }: Props) {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<TagColor>('gray')

  const { data: tags = [], isLoading } = useQuery({ queryKey: ['tags'], queryFn: listTags })

  const createMutation = useMutation({
    mutationFn: createTag,
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      onChange([...value, tag.id])
      setNewName('')
    },
  })

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border border-gray-200 p-2">
        {isLoading && <span className="text-xs text-gray-400">Cargando…</span>}
        {!isLoading && tags.length === 0 && (
          <span className="text-xs text-gray-400">Sin etiquetas todavía.</span>
        )}
        {tags.map((tag) => (
          <label key={tag.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.includes(tag.id)}
              onChange={() => toggle(tag.id)}
            />
            <TagBadge tag={tag} />
          </label>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nueva etiqueta…"
          maxLength={60}
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-iieg-500 focus:outline-none focus:ring-1 focus:ring-iieg-500"
        />
        <select
          value={newColor}
          onChange={(e) => setNewColor(e.target.value as TagColor)}
          className={`rounded-md border-0 px-1.5 py-1 text-xs font-medium ${TAG_COLOR_CLASSES[newColor]}`}
        >
          {TAG_COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!newName.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate({ name: newName.trim(), color: newColor })}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          + Crear
        </button>
      </div>
      {createMutation.isError && <ErrorBanner error={createMutation.error} compact small />}
    </div>
  )
}
