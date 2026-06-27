import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createConexion, updateConexion } from './api'
import type { Connection, ConnectionEngine } from '@/types/connections'

interface FormValues {
  name: string
  description: string
  engine: ConnectionEngine
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl_enabled: boolean
  read_only: boolean
}

const DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  postgis: 5432,
  duckdb: 0,
}

interface Props {
  editing?: Connection | null
  onClose: () => void
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="mt-0.5 text-xs text-red-500">{error}</p>}
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-iieg-500 focus:outline-none focus:ring-1 focus:ring-iieg-500 disabled:bg-gray-50'

export function ConexionForm({ editing, onClose }: Props) {
  const qc = useQueryClient()
  const isEdit = editing != null

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: editing
      ? {
          name: editing.name,
          description: editing.description ?? '',
          engine: editing.engine,
          host: editing.host,
          port: editing.port,
          database: editing.database,
          username: editing.username,
          password: '',
          ssl_enabled: editing.ssl_enabled,
          read_only: editing.read_only,
        }
      : {
          engine: 'postgresql',
          port: 5432,
          ssl_enabled: false,
          read_only: true,
          description: '',
          password: '',
        },
  })

  const engine = watch('engine')
  useEffect(() => {
    if (!isEdit) setValue('port', DEFAULT_PORTS[engine] ?? 5432)
  }, [engine, isEdit, setValue])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit) {
        const { password, ...rest } = values
        return updateConexion(editing.id, password ? { ...rest, password } : rest)
      }
      return createConexion(values)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conexiones'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Editar conexión' : 'Nueva conexión'}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Formulario */}
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="max-h-[80vh] overflow-y-auto px-6 py-4"
        >
          <div className="space-y-4">
            <Field label="Nombre" error={errors.name?.message}>
              <input
                {...register('name', {
                  required: 'Requerido',
                  maxLength: { value: 120, message: 'Máximo 120 caracteres' },
                })}
                className={inputCls}
                placeholder="Mi base de datos"
              />
            </Field>

            <Field label="Descripción (opcional)" error={errors.description?.message}>
              <textarea
                {...register('description', {
                  maxLength: { value: 500, message: 'Máximo 500 caracteres' },
                })}
                rows={2}
                className={inputCls}
                placeholder="Descripción breve de la fuente de datos"
              />
            </Field>

            <Field label="Motor" error={errors.engine?.message}>
              <select {...register('engine', { required: true })} className={inputCls}>
                <option value="postgresql">PostgreSQL</option>
                <option value="postgis">PostGIS</option>
                <option value="duckdb">DuckDB</option>
              </select>
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Host" error={errors.host?.message}>
                  <input
                    {...register('host', {
                      required: 'Requerido',
                      maxLength: { value: 255, message: 'Máximo 255 caracteres' },
                    })}
                    className={inputCls}
                    placeholder="localhost"
                  />
                </Field>
              </div>
              <Field label="Puerto" error={errors.port?.message}>
                <input
                  {...register('port', {
                    required: 'Requerido',
                    valueAsNumber: true,
                    min: { value: 0, message: 'Puerto inválido' },
                    max: { value: 65535, message: 'Puerto inválido' },
                  })}
                  type="number"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Base de datos" error={errors.database?.message}>
              <input
                {...register('database', {
                  required: 'Requerido',
                  maxLength: { value: 255, message: 'Máximo 255 caracteres' },
                })}
                className={inputCls}
                placeholder="nombre_bd"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Usuario" error={errors.username?.message}>
                <input
                  {...register('username', {
                    required: 'Requerido',
                    maxLength: { value: 255, message: 'Máximo 255 caracteres' },
                  })}
                  className={inputCls}
                  autoComplete="off"
                />
              </Field>
              <Field
                label={isEdit ? 'Contraseña (vacío = mantener)' : 'Contraseña'}
                error={errors.password?.message}
              >
                <input
                  {...register('password', {
                    required: isEdit ? false : 'Requerido',
                  })}
                  type="password"
                  className={inputCls}
                  autoComplete="new-password"
                />
              </Field>
            </div>

            <div className="flex gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input {...register('ssl_enabled')} type="checkbox" className="rounded" />
                SSL habilitado
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input {...register('read_only')} type="checkbox" className="rounded" />
                Solo lectura
              </label>
            </div>
          </div>

          {mutation.error && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {(mutation.error as Error).message}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-md bg-iieg-700 px-4 py-2 text-sm font-medium text-white hover:bg-iieg-600 disabled:opacity-60"
            >
              {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear conexión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
