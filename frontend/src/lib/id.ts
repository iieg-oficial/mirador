/**
 * Genera un UUID v4 para identificar items en el cliente antes de persistirlos.
 *
 * No se usa `crypto.randomUUID()` directo: esa API solo existe en **contextos
 * seguros** (HTTPS, `localhost` o `127.0.0.1`). En el despliegue interno, servido
 * por HTTP plano contra una IP, es `undefined` y cualquier handler que la llame
 * revienta con TypeError. `crypto.getRandomValues()` sí está disponible en
 * contextos inseguros, así que sirve de respaldo.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variante RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
