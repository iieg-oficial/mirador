import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { buildDashboardZip, buildMetadata, buildReportPdf } from './export'
import type { DashboardItemRead } from '@/types/dashboards'

const dashboard = { name: 'Ventas 2026', description: 'Resumen mensual', updated_at: '2026-07-01T00:00:00Z' }

const chartItem: DashboardItemRead = {
  id: 'c1',
  dashboard_id: 'd1',
  chart_id: 'chart-1',
  item_type: 'chart',
  position_config: { x: 0, y: 0, w: 6, h: 4 },
  local_config: {},
}

const markdownItem: DashboardItemRead = {
  id: 'm1',
  dashboard_id: 'd1',
  chart_id: null,
  item_type: 'markdown',
  position_config: { x: 0, y: 4, w: 6, h: 3 },
  local_config: { content: 'Notas del tablero' },
}

describe('buildMetadata', () => {
  it('incluye nombre, items con su archivo y timestamp de exportación', () => {
    const meta = buildMetadata({ dashboard, items: [chartItem, markdownItem], chartExports: new Map() })
    expect(meta.nombre).toBe('Ventas 2026')
    expect(meta.items).toEqual([
      { id: 'c1', archivo: 'grafica_1', tipo: 'chart' },
      { id: 'm1', archivo: 'texto_2', tipo: 'markdown' },
    ])
    expect(typeof meta.exportado_en).toBe('string')
  })
})

describe('buildReportPdf', () => {
  it('genera una página de portada + una por item, sin lanzar', () => {
    const chartExports = new Map([
      ['c1', { getPng: () => null, rows: [{ region: 'Jalisco', total: 100 }], columns: ['region', 'total'] }],
    ])
    const doc = buildReportPdf({ dashboard, items: [chartItem, markdownItem], chartExports })
    expect(doc.getNumberOfPages()).toBe(3)
  })
})

describe('buildDashboardZip', () => {
  it('empaca metadata.json, reporte.pdf y datos/csv por gráfica con filas', async () => {
    const chartExports = new Map([
      ['c1', { getPng: () => null, rows: [{ region: 'Jalisco', total: 100 }], columns: ['region', 'total'] }],
    ])
    const blob = await buildDashboardZip({ dashboard, items: [chartItem, markdownItem], chartExports })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(
      ['metadata.json', 'reporte.pdf', 'datos/', 'graficas/', 'datos/grafica_1.csv'].sort(),
    )
  })

  it('omite el CSV cuando la gráfica no tiene filas (ej. sin datos)', async () => {
    const chartExports = new Map([['c1', { getPng: () => null, rows: [], columns: [] }]])
    const blob = await buildDashboardZip({ dashboard, items: [chartItem], chartExports })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files)).not.toContain('datos/grafica_1.csv')
  })
})
