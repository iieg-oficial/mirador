import { describe, expect, it } from 'vitest'
import { resolveDashboardTemplate } from './resolveDashboardTemplate'
import type { TemplateContext } from './resolveDashboardTemplate'

const context: TemplateContext = {
  kpi: { total_ventas: '1,234' },
  filter: { municipio: 'Guadalajara' },
  dashboard: { title: 'Panel de ventas' },
}

describe('resolveDashboardTemplate', () => {
  it('sustituye una variable simple', () => {
    expect(resolveDashboardTemplate('Total: {{ kpi.total_ventas }}', context)).toBe(
      'Total: 1,234',
    )
    expect(resolveDashboardTemplate('{{filter.municipio}}', context)).toBe('Guadalajara')
    expect(resolveDashboardTemplate('{{ dashboard.title }}', context)).toBe('Panel de ventas')
  })

  it('deja el placeholder intacto si la clave no existe', () => {
    expect(resolveDashboardTemplate('{{ kpi.no_existe }}', context)).toBe('{{ kpi.no_existe }}')
  })

  it('deja intacto un namespace fuera de la whitelist', () => {
    expect(resolveDashboardTemplate('{{ user.name }}', context)).toBe('{{ user.name }}')
    expect(resolveDashboardTemplate('{{ algo() }}', context)).toBe('{{ algo() }}')
  })

  it('deja intactos intentos de acceder a propiedades de prototipo', () => {
    expect(resolveDashboardTemplate('{{ constructor }}', context)).toBe('{{ constructor }}')
    expect(resolveDashboardTemplate('{{ __proto__ }}', context)).toBe('{{ __proto__ }}')
    expect(resolveDashboardTemplate('{{ kpi.__proto__ }}', context)).toBe('{{ kpi.__proto__ }}')
  })
})
