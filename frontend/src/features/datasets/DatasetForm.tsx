import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { createDataset, updateDataset } from './api'
import { listConexiones } from '@/features/connections/api'
import { TagPicker } from '@/components/shared/TagPicker'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import type { Dataset, DatasetCreate, DatasetUpdate } from '@/types/datasets'

interface FormValues {
  connection_id: string
  name: string
  slug: string
  description: string
  sql_query: string
  max_rows: number
  cache_ttl_seconds: number
}

interface Props {
  editing?: Dataset | null
  prefill?: { connection_id: string; sql: string }
  onClose: () => void
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120)
}

export function DatasetForm({ editing, prefill, onClose }: Props) {
  const qc = useQueryClient()
  const isEdit = Boolean(editing)

  const { data: conexiones = [] } = useQuery({
    queryKey: ['conexiones'],
    queryFn: () => listConexiones(),
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: editing
      ? {
          connection_id: editing.connection_id,
          name: editing.name,
          slug: editing.slug,
          description: editing.description ?? '',
          sql_query: editing.sql_query,
          max_rows: editing.max_rows,
          cache_ttl_seconds: editing.cache_ttl_seconds,
        }
      : {
          connection_id: prefill?.connection_id ?? '',
          name: '',
          slug: '',
          description: '',
          sql_query: prefill?.sql ?? '',
          max_rows: 1000,
          cache_ttl_seconds: 300,
        },
  })

  const nameValue = watch('name')
  useEffect(() => {
    if (!isEdit) setValue('slug', slugify(nameValue))
  }, [nameValue, isEdit, setValue])

  const [tagIds, setTagIds] = useState<string[]>(editing?.tags.map((t) => t.id) ?? [])

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (isEdit) {
        // connection_id y slug son inmutables tras crear el dataset: el backend
        // los ignora en DatasetUpdate (ver REVISION_CODIGO.md #11), así que ni
        // siquiera se envían.
        const payload: DatasetUpdate = {
          name: values.name,
          description: values.description || null,
          sql_query: values.sql_query,
          max_rows: values.max_rows,
          cache_ttl_seconds: values.cache_ttl_seconds,
          tag_ids: tagIds,
        }
        return updateDataset(editing!.id, payload)
      }
      const payload: DatasetCreate = {
        connection_id: values.connection_id,
        name: values.name,
        slug: values.slug,
        description: values.description || null,
        sql_query: values.sql_query,
        max_rows: values.max_rows,
        cache_ttl_seconds: values.cache_ttl_seconds,
        tag_ids: tagIds,
      }
      return createDataset(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasets'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Editar dataset' : 'Guardar dataset'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth={1.5} fill="none" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4 p-6">
          {/* Conexión */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Conexión *</label>
            <select
              {...register('connection_id', { required: 'Requerido' })}
              disabled={isEdit}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-iieg-500 focus:outline-none focus:ring-1 focus:ring-iieg-500 disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">— selecciona —</option>
              {conexiones
                .filter((c) => c.status !== 'archivada')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            {isEdit && (
              <p className="text-xs text-gray-400">No se puede cambiar tras crear el dataset.</p>
            )}
            {errors.connection_id && (
              <p className="text-xs text-red-600">{errors.connection_id.message}</p>
            )}
          </div>

          {/* Nombre y slug */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Nombre *</label>
              <input
                {...register('name', { required: 'Requerido', maxLength: { value: 120, message: 'Máximo 120 caracteres' } })}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-iieg-500 focus:outline-none focus:ring-1 focus:ring-iieg-500"
                placeholder="Población municipal"
              />
              {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Slug *</label>
              <input
                {...register('slug', {
                  required: 'Requerido',
                  maxLength: { value: 120, message: 'Máximo 120 caracteres' },
                  pattern: { value: /^[a-z0-9_-]+$/, message: 'Solo letras minúsculas, números, _ y -' },
                })}
                disabled={isEdit}
                className="rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-iieg-500 focus:outline-none focus:ring-1 focus:ring-iieg-500 disabled:bg-gray-100 disabled:text-gray-500"
                placeholder="poblacion_municipal"
              />
              {isEdit && (
                <p className="text-xs text-gray-400">No se puede cambiar tras crear el dataset.</p>
              )}
              {errors.slug && <p className="text-xs text-red-600">{errors.slug.message}</p>}
            </div>
          </div>

          {/* Descripción */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Descripción</label>
            <input
              {...register('description', { maxLength: { value: 500, message: 'Máximo 500 caracteres' } })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-iieg-500 focus:outline-none focus:ring-1 focus:ring-iieg-500"
              placeholder="Opcional"
            />
          </div>

          {/* SQL */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Consulta SQL *</label>
            <textarea
              {...register('sql_query', { required: 'Requerido' })}
              rows={6}
              spellCheck={false}
              className="rounded-md border border-gray-300 p-3 font-mono text-sm focus:border-iieg-500 focus:outline-none focus:ring-1 focus:ring-iieg-500"
              placeholder="SELECT ..."
            />
            {errors.sql_query && (
              <p className="text-xs text-red-600">{errors.sql_query.message}</p>
            )}
          </div>

          {/* max_rows y cache */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Máx. filas</label>
              <input
                type="number"
                {...register('max_rows', { valueAsNumber: true, min: { value: 1, message: 'Mínimo 1' }, max: { value: 50000, message: 'Máximo 50 000' } })}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-iieg-500 focus:outline-none focus:ring-1 focus:ring-iieg-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Caché (segundos)</label>
              <input
                type="number"
                {...register('cache_ttl_seconds', { valueAsNumber: true, min: { value: 0, message: 'Mínimo 0' }, max: { value: 86400, message: 'Máximo 86 400' } })}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-iieg-500 focus:outline-none focus:ring-1 focus:ring-iieg-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Etiquetas</label>
            <TagPicker value={tagIds} onChange={setTagIds} />
          </div>

          {mutation.isError && <ErrorBanner error={mutation.error} fallback="Error al guardar" />}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-md bg-iieg-700 px-4 py-2 text-sm font-medium text-white hover:bg-iieg-800 disabled:opacity-50"
            >
              {mutation.isPending ? 'Guardando…' : isEdit ? 'Actualizar' : 'Guardar dataset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
