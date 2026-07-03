// Exportación CSV client-side. Los previews ya vienen capados server-side a
// dataset.max_rows, así que descargar las filas cargadas equivale a lo que
// devolvería un endpoint de exportación — sin backend nuevo.

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // RFC 4180: comillas dobladas; se citan celdas con coma, comilla o salto.
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** Genera el texto CSV (RFC 4180, con BOM para que Excel respete acentos). */
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [
    columns.map(escapeCell).join(','),
    ...rows.map((row) => columns.map((c) => escapeCell(row[c])).join(',')),
  ]
  return '﻿' + lines.join('\r\n')
}

/** Genera un CSV y lo descarga. */
export function downloadCsv(
  filename: string,
  columns: string[],
  rows: Record<string, unknown>[],
): void {
  const blob = new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
