// Cross-filtering por clic en gráfica (§6). Un item `chart` con
// local_config.cross_filter = {enabled, targets} dispara, al hacer clic en un
// dato, un FilterSpec `=` hacia los items mapeados en `targets` (mismo shape
// que los targets de filtros globales, ver dashboardFilters.ts). Reclic sobre
// el mismo valor lo apaga (modo toggle). Bloques sin ese item_id en targets
// simplemente no reciben filtro — no rompen.

import type { FilterSpec } from '@/types/charts'
import type { FilterTarget } from './dashboardFilters'

export interface CrossFilterConfig {
  enabled: boolean
  targets: FilterTarget[]
}

export function crossFilterOf(localConfig: Record<string, unknown>): CrossFilterConfig {
  const raw = localConfig.cross_filter as Partial<CrossFilterConfig> | undefined
  return { enabled: !!raw?.enabled, targets: Array.isArray(raw?.targets) ? raw.targets : [] }
}

/** Estado de interacciones tras un clic en `sourceItemId` (toggle). */
export function toggleInteraction(
  interactions: Record<string, unknown>,
  sourceItemId: string,
  clickedValue: unknown,
): Record<string, unknown> {
  const next = { ...interactions }
  if (next[sourceItemId] === clickedValue) delete next[sourceItemId]
  else next[sourceItemId] = clickedValue
  return next
}

/** FilterSpecs a aplicar a `itemId` a partir de las interacciones activas. */
export function resolveCrossFilters(
  items: { id: string; local_config: Record<string, unknown> }[],
  interactions: Record<string, unknown>,
  itemId: string,
): FilterSpec[] {
  const specs: FilterSpec[] = []
  for (const source of items) {
    if (source.id === itemId) continue
    const value = interactions[source.id]
    if (value == null) continue
    const { enabled, targets } = crossFilterOf(source.local_config)
    if (!enabled) continue
    for (const t of targets) {
      if (t.item_id === itemId) specs.push({ field: t.field, operator: '=', value })
    }
  }
  return specs
}
