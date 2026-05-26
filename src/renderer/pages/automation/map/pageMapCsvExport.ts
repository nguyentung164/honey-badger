import type { TestCatalogPage } from 'shared/automation/types'

const UTF8_BOM = '\uFEFF'
const CATALOG_PAGES_CSV_HEADER = ['name', 'slug', 'description'] as const

export type CatalogPageCsvRow = {
  name: string
  slug?: string
  description?: string
}

function escapeCsvField(raw: string): string {
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`
  return raw
}

function parseCsvRowsWithSep(content: string, sep: ',' | ';'): string[][] {
  let s = content
  if (s.startsWith(UTF8_BOM)) s = s.slice(UTF8_BOM.length)
  const rows: string[][] = []
  let i = 0
  const len = s.length

  const readRow = (): string[] => {
    const cells: string[] = []
    let cell = ''
    while (i < len) {
      const c = s[i]
      if (c === '"') {
        i++
        while (i < len) {
          if (s[i] === '"') {
            i++
            if (s[i] === '"') {
              cell += '"'
              i++
            } else break
          } else {
            cell += s[i]
            i++
          }
        }
        continue
      }
      if (c === sep) {
        cells.push(cell)
        cell = ''
        i++
        continue
      }
      if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++
        i++
        cells.push(cell)
        return cells
      }
      cell += c
      i++
    }
    cells.push(cell)
    return cells
  }

  while (i < len) {
    const row = readRow()
    if (row.some(c => c.trim() !== '')) rows.push(row)
  }
  return rows
}

function parseCsvRows(content: string): string[][] {
  const rowsComma = parseCsvRowsWithSep(content, ',')
  const rowsSemicolon = parseCsvRowsWithSep(content, ';')
  const colsComma = rowsComma[0]?.length ?? 0
  const colsSemicolon = rowsSemicolon[0]?.length ?? 0
  return colsSemicolon > colsComma && colsSemicolon >= 2 ? rowsSemicolon : rowsComma
}

function isCatalogPagesHeaderRow(cells: string[]): boolean {
  if (!cells.length) return false
  const head = cells.map(c => c.trim().toLowerCase())
  return (
    head[0] === CATALOG_PAGES_CSV_HEADER[0] &&
    (head.length === 1 ||
      head[1] === CATALOG_PAGES_CSV_HEADER[1] ||
      head[1] === '' ||
      head.slice(0, 3).every((v, idx) => v === CATALOG_PAGES_CSV_HEADER[idx] || v === ''))
  )
}

/** Parse page-map CSV exported by `buildCatalogPagesCsv` (RFC-style quoting, UTF-8 BOM, `,` or `;`). */
export function parseCatalogPagesCsv(content: string): CatalogPageCsvRow[] {
  const rows = parseCsvRows(content)
  const header = rows[0]
  const dataRows = rows.length > 0 && header && isCatalogPagesHeaderRow(header) ? rows.slice(1) : rows
  const out: CatalogPageCsvRow[] = []

  for (const cells of dataRows) {
    const name = (cells[0] ?? '').trim()
    if (!name) continue
    const slugRaw = (cells[1] ?? '').trim()
    const descRaw = (cells[2] ?? '').trim()
    out.push({
      name,
      slug: slugRaw || undefined,
      description: descRaw || undefined,
    })
  }

  return out
}

export function buildCatalogPagesCsv(pages: TestCatalogPage[]): string {
  const sorted = [...pages].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const lines = [CATALOG_PAGES_CSV_HEADER.join(',')]
  for (const p of sorted) {
    lines.push([escapeCsvField(p.name), escapeCsvField(p.slug ?? ''), escapeCsvField(p.description ?? '')].join(','))
  }
  return UTF8_BOM + lines.join('\n')
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
