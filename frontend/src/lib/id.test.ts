import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from './id'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('newId', () => {
  it('devuelve un UUID v4 cuando crypto.randomUUID existe (contexto seguro)', () => {
    expect(newId()).toMatch(UUID_V4)
  })

  it('cae al respaldo cuando crypto.randomUUID no existe (HTTP plano)', () => {
    // Contexto inseguro: randomUUID no está expuesta, getRandomValues sí.
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })

    expect(newId()).toMatch(UUID_V4)
    expect(new Set(Array.from({ length: 100 }, newId)).size).toBe(100)
  })
})
