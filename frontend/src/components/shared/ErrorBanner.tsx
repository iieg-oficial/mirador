const RECOVERY_HINT = 'Verifica e intenta de nuevo. Si el problema persiste, contacta a soporte.'

interface Props {
  error: unknown
  fallback?: string
  title?: string
  /** Sin caja/fondo — para paneles angostos donde el bloque rojo pesaría demasiado. */
  compact?: boolean
  /** Tipografía reducida (text-xs) para paneles compactos como el explorador de esquema. */
  small?: boolean
  className?: string
}

/** Muestra el error de una mutation/query con un paso siguiente accionable, nunca el mensaje crudo a solas. */
export function ErrorBanner({ error, fallback = 'Error inesperado', title, compact = false, small = false, className = '' }: Props) {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : fallback
  const bodySize = small ? 'text-xs' : 'text-sm'
  const hintSize = small ? 'text-[11px]' : 'text-xs'

  if (compact) {
    return (
      <p className={`${bodySize} text-red-600 ${className}`}>
        {message}
        <span className={`block ${hintSize} text-red-400`}>{RECOVERY_HINT}</span>
      </p>
    )
  }

  return (
    <div className={`rounded-lg border border-red-100 bg-red-50 ${small ? 'p-2' : 'p-3'} ${bodySize} text-red-700 ${className}`}>
      {title && <p className="font-semibold">{title}</p>}
      <p className={title ? 'mt-1' : ''}>{message}</p>
      <p className={`mt-1 ${hintSize} text-red-500`}>{RECOVERY_HINT}</p>
    </div>
  )
}
