// Exportación del tablero completo (§7): reporte.pdf + metadata.json +
// graficas/*.png + datos/*.csv, empacados en un ZIP. También expone el PDF
// solo, sin el ZIP. Los datos vienen de los `onExportReady` que cada
// ChartItemBlock ya reportó al montarse (mismos filtros activos, sin volver a
// consultar el backend).

import jsPDF from 'jspdf'
import JSZip from 'jszip'
import { toCsv } from '@/lib/csv'
import type { ChartExportInfo } from '@/features/charts/ChartRenderer'
import type { DashboardItemRead, DashboardRead } from '@/types/dashboards'

export interface DashboardExportData {
  dashboard: Pick<DashboardRead, 'name' | 'description' | 'updated_at'>
  items: DashboardItemRead[]
  chartExports: Map<string, ChartExportInfo>
}

function itemLabel(item: DashboardItemRead, idx: number): string {
  return item.item_type === 'chart' ? `grafica_${idx + 1}` : `texto_${idx + 1}`
}

export function buildMetadata({ dashboard, items }: DashboardExportData): Record<string, unknown> {
  return {
    nombre: dashboard.name,
    descripcion: dashboard.description,
    actualizado_en: dashboard.updated_at,
    exportado_en: new Date().toISOString(),
    items: items.map((item, idx) => ({ id: item.id, archivo: itemLabel(item, idx), tipo: item.item_type })),
  }
}

/** Portada + una página por item: imagen de la gráfica, texto del Markdown, o
 * una vista tabular de las filas cuando el item no tiene PNG (tabla/KPI). */
export function buildReportPdf({ dashboard, items, chartExports }: DashboardExportData): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  const textWidth = pageWidth - margin * 2

  doc.setFontSize(18)
  doc.text(dashboard.name, margin, 20)
  if (dashboard.description) {
    doc.setFontSize(11)
    doc.text(doc.splitTextToSize(dashboard.description, textWidth), margin, 30)
  }

  for (const [idx, item] of items.entries()) {
    doc.addPage()
    doc.setFontSize(13)
    doc.text(itemLabel(item, idx), margin, 20)

    if (item.item_type === 'markdown') {
      doc.setFontSize(10)
      doc.text(doc.splitTextToSize(String(item.local_config.content ?? ''), textWidth), margin, 30)
      continue
    }

    const info = chartExports.get(item.id)
    const png = info?.getPng()
    doc.setFontSize(9)
    if (png) {
      doc.addImage(png, 'PNG', margin, 28, textWidth, 100)
    } else if (info && info.rows.length > 0) {
      const preview = info.rows
        .slice(0, 25)
        .map((row) => info.columns.map((c) => String(row[c] ?? '')).join('  ·  '))
      doc.text(doc.splitTextToSize(preview.join('\n'), textWidth), margin, 30)
    } else {
      doc.text('Sin datos disponibles.', margin, 30)
    }
  }

  return doc
}

/** ZIP con reporte.pdf, metadata.json y una carpeta por gráfica con su PNG/CSV. */
export async function buildDashboardZip(data: DashboardExportData): Promise<Blob> {
  const zip = new JSZip()
  zip.file('metadata.json', JSON.stringify(buildMetadata(data), null, 2))
  zip.file('reporte.pdf', buildReportPdf(data).output('arraybuffer'))

  const graficas = zip.folder('graficas')!
  const datos = zip.folder('datos')!
  for (const [idx, item] of data.items.entries()) {
    if (item.item_type !== 'chart') continue
    const info = data.chartExports.get(item.id)
    if (!info) continue
    const label = itemLabel(item, idx)
    const png = info.getPng()
    if (png) graficas.file(`${label}.png`, png.split(',')[1] ?? '', { base64: true })
    if (info.rows.length > 0) datos.file(`${label}.csv`, toCsv(info.columns, info.rows))
  }

  return zip.generateAsync({ type: 'blob' })
}
