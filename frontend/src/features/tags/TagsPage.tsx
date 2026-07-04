import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTag, deleteTag, listTags, updateTag } from './api'
import { TAG_COLORS, TAG_COLOR_CLASSES } from '@/types/tags'
import type { Tag, TagColor } from '@/types/tags'

function ColorSelect({ value, onChange }: { value: TagColor; onChange: (c: TagColor) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TagColor)}
      className={`rounded-md border-0 px-1.5 py-1 text-xs font-medium ${TAG_COLOR_CLASSES[value]}`}
    >
      {TAG_COLORS.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  )
}

function TagRow({ tag }: { tag: Tag }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState<TagColor>(tag.color)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateMutation = useMutation({
    mutationFn: () => updateTag(tag.id, { name, color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      setEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTag(tag.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  })

  return (
    <tr className="hover:bg-gray-50/60">
      <td className="px-4 py-2.5">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-iieg-500 focus:outline-none"
          />
        ) : (
          <span className="text-sm font-medium text-gray-800">{tag.name}</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {editing ? (
          <ColorSelect value={color} onChange={setColor} />
        ) : (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${TAG_COLOR_CLASSES[tag.color]}`}>
            {tag.color}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {editing ? (
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => updateMutation.mutate()}
              disabled={!name.trim() || updateMutation.isPending}
              className="rounded-md bg-iieg-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-iieg-600 disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setName(tag.name)
                setColor(tag.color)
              }}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        ) : confirmDelete ? (
          <div className="flex justify-end gap-1.5">
            <span className="text-xs text-red-600">¿Eliminar?</span>
            <button
              onClick={() => deleteMutation.mutate()}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Confirmar
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setEditing(true)}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              Editar
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              Eliminar
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

export function TagsPage() {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<TagColor>('gray')

  const { data: tags = [], isLoading } = useQuery({ queryKey: ['tags'], queryFn: listTags })

  const createMutation = useMutation({
    mutationFn: createTag,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      setNewName('')
    },
  })

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-gray-900">Etiquetas</h1>
        <p className="text-sm text-gray-500">
          Cataloga conexiones, datasets y gráficas para encontrarlas rápido a gran escala.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre de la nueva etiqueta"
              maxLength={60}
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-iieg-500 focus:outline-none"
            />
            <ColorSelect value={newColor} onChange={setNewColor} />
            <button
              onClick={() => createMutation.mutate({ name: newName.trim(), color: newColor })}
              disabled={!newName.trim() || createMutation.isPending}
              className="rounded-md bg-iieg-700 px-3 py-2 text-sm font-medium text-white hover:bg-iieg-600 disabled:opacity-50"
            >
              Crear
            </button>
          </div>
          {createMutation.isError && (
            <p className="mb-3 text-xs text-red-600">{(createMutation.error as Error).message}</p>
          )}

          {isLoading && <p className="text-sm text-gray-400">Cargando…</p>}

          {!isLoading && tags.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">Aún no hay etiquetas.</p>
          )}

          {tags.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Nombre</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Color</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {tags.map((tag) => (
                    <TagRow key={tag.id} tag={tag} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
