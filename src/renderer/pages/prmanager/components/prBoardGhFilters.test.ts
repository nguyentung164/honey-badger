import { describe, expect, it } from 'vitest'
import type { PrBranchCheckpoint, PrCheckpointTemplate, TrackedBranchRow } from '../hooks/usePrData'
import {
  flattenPrBoardRowsForPaging,
  mergePrBoardFilteredRows,
  rowMatchesPrGhBoardFilters,
  rowMatchesPrGhFiltersPerTemplate,
} from './prBoardGhFilters'

function tpl(id: string, code: string, targetBranch: string): PrCheckpointTemplate {
  return {
    id,
    code,
    label: code,
    targetBranch,
    sortOrder: 0,
    isActive: true,
    projectId: 'p1',
  }
}

function cp(templateId: string, prNumber: number, state: 'open' | 'closed', draft = false): PrBranchCheckpoint {
  return {
    id: `cp-${templateId}`,
    templateId,
    trackedBranchId: 'row1',
    prNumber,
    ghPrState: state,
    ghPrDraft: draft,
    ghPrMerged: false,
  }
}

function row(checkpoints: PrBranchCheckpoint[]): TrackedBranchRow {
  return {
    id: 'row1',
    projectId: 'p1',
    repoId: 'repo1',
    repoOwner: 'o',
    repoRepo: 'r',
    repoName: 'r',
    branchName: 'feature/x',
    checkpoints,
    note: null,
  }
}

const prDev = tpl('dev', 'pr_dev', 'dev')
const prStage = tpl('stage', 'pr_stage', 'stage')
const prTemplates = [prDev, prStage]
const templates = prTemplates
const openDraft = new Set(['open', 'draft'] as const)

describe('rowMatchesPrGhFiltersPerTemplate', () => {
  it('OR: matches when any column has a matching PR', () => {
    const r = row([cp('dev', 1, 'open')])
    expect(rowMatchesPrGhFiltersPerTemplate(r, prTemplates, templates, {}, openDraft, 'or')).toBe(true)
    expect(rowMatchesPrGhFiltersPerTemplate(r, prTemplates, templates, {}, openDraft, 'and')).toBe(false)
  })

  it('AND: matches when every narrowed column has a matching PR', () => {
    const r = row([cp('dev', 1, 'open'), cp('stage', 2, 'open')])
    expect(rowMatchesPrGhFiltersPerTemplate(r, prTemplates, templates, {}, openDraft, 'and')).toBe(true)
    expect(rowMatchesPrGhFiltersPerTemplate(r, prTemplates, templates, {}, openDraft, 'or')).toBe(true)
  })

  it('advanced per-column filters respect combine mode', () => {
    const r = row([cp('dev', 1, 'open'), cp('stage', 2, 'open')])
    const filtersByTpl = { dev: ['merged'] as const, stage: ['open'] as const }
    expect(rowMatchesPrGhFiltersPerTemplate(r, prTemplates, templates, filtersByTpl, openDraft, 'or')).toBe(true)
    expect(rowMatchesPrGhFiltersPerTemplate(r, prTemplates, templates, filtersByTpl, openDraft, 'and')).toBe(false)
  })
})

describe('mergePrBoardFilteredRows', () => {
  it('puts PR-matching rows before no-PR rows when filter is narrowed', () => {
    const withPr = { ...row([cp('dev', 1, 'open')]), id: 'with-pr' }
    const noPr = { ...row([]), id: 'no-pr' }
    const merged = mergePrBoardFilteredRows([withPr], [noPr], true, true)
    expect(merged.map(r => r.id)).toEqual(['with-pr', 'no-pr'])
  })
})

describe('flattenPrBoardRowsForPaging', () => {
  it('lists all PR rows before no-PR rows across repos when narrowed', () => {
    const prA = { ...row([cp('dev', 1, 'open')]), id: 'pr-a', branchName: 'b-pr' }
    const noA = { ...row([]), id: 'no-a', branchName: 'a-no' }
    const grouped: Array<[string, TrackedBranchRow[]]> = [['repo/a', [noA, prA]]]
    const flat = flattenPrBoardRowsForPaging(grouped, r => r.checkpoints.some(c => c.prNumber != null), true, true)
    expect(flat.map(r => r.id)).toEqual(['pr-a', 'no-a'])
  })
})

describe('rowMatchesPrGhBoardFilters', () => {
  it('simple mode uses simple combine mode', () => {
    const r = row([cp('dev', 1, 'open')])
    expect(
      rowMatchesPrGhBoardFilters(r, prTemplates, templates, {
        advancedFiltersOpen: false,
        prGhFilters: openDraft,
        prGhFiltersByTpl: {},
        combineMode: 'or',
      })
    ).toBe(true)
    expect(
      rowMatchesPrGhBoardFilters(r, prTemplates, templates, {
        advancedFiltersOpen: false,
        prGhFilters: openDraft,
        prGhFiltersByTpl: {},
        combineMode: 'and',
      })
    ).toBe(false)
  })
})
