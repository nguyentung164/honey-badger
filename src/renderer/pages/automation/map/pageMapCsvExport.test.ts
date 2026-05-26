import { describe, expect, it } from 'vitest'
import type { TestCatalogPage } from 'shared/automation/types'
import { buildCatalogPagesCsv, parseCatalogPagesCsv } from '@/pages/automation/map/pageMapCsvExport'

describe('pageMapCsvExport', () => {
  const samplePages: TestCatalogPage[] = [
    {
      id: 'p1',
      projectId: 'proj',
      name: 'Hello, "world"',
      slug: 'hi',
      description: 'line\nbreak',
      sortOrder: 0,
      groupId: null,
    },
    {
      id: 'p2',
      projectId: 'proj',
      name: 'username',
      slug: 'user-name',
      description: 'must not be skipped',
      sortOrder: 1,
      groupId: null,
    },
  ]

  it('builds header and escaped rows', () => {
    const csv = buildCatalogPagesCsv(samplePages)
    expect(csv.replace(/^\uFEFF/, '').split('\n')[0]).toBe('name,slug,description')
    expect(csv).toContain('"Hello, ""world"""')
    expect(csv).toContain('"line\nbreak"')
  })

  it('round-trips exported CSV', () => {
    const csv = buildCatalogPagesCsv(samplePages)
    const rows = parseCatalogPagesCsv(csv)
    expect(rows).toEqual([
      { name: 'Hello, "world"', slug: 'hi', description: 'line\nbreak' },
      { name: 'username', slug: 'user-name', description: 'must not be skipped' },
    ])
  })

  it('skips only the header row, not rows whose name contains "name"', () => {
    const csv = buildCatalogPagesCsv(samplePages)
    const rows = parseCatalogPagesCsv(csv)
    expect(rows.some(r => r.name === 'username')).toBe(true)
  })

  it('parses semicolon-separated CSV from Excel locales', () => {
    const csv = 'name;slug;description\n"Hello; there";page-a;desc'
    expect(parseCatalogPagesCsv(csv)).toEqual([{ name: 'Hello; there', slug: 'page-a', description: 'desc' }])
  })
})
