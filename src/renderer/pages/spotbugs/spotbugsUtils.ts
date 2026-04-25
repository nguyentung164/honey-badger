import { CATEGORY_DESCRIPTIONS } from '@/components/shared/constants'
import type { BugInstance, SpotBugsResult } from './constants'

export function getCategoryDescriptions(categoryType: string): string {
  return CATEGORY_DESCRIPTIONS[categoryType] || 'Unknown Category'
}

export function processSpotBugsResult(result: any, getCategoryDesc = getCategoryDescriptions): SpotBugsResult {
  if (result.project && result.summary && result.bugInstances) {
    const processedBugInstances = result.bugInstances.map((bug: BugInstance) => {
      const primaryClass = bug.classes?.find(c => c.primary) || bug.classes?.[0]
      const primarySourceLine = bug.sourceLines?.find(sl => sl.primary) || primaryClass?.sourceLine || bug.sourceLines?.[0]
      return {
        ...bug,
        className: primaryClass?.classname || '',
        sourceFile: primarySourceLine?.sourcefile || '',
        startLine: primarySourceLine?.start ?? 0,
        endLine: primarySourceLine?.end ?? 0,
        message: bug.shortMessage || bug.longMessage || '',
        details: bug.patternDetails?.details || bug.longMessage || '',
        categoryDescription: bug.categoryDetails?.description || getCategoryDesc(bug.category) || '',
      }
    })
    return {
      ...result,
      bugInstances: processedBugInstances,
      bugCount: {
        total: result.summary.totalBugs || 0,
        byPriority: {
          high: result.summary.priority1 || 0,
          medium: result.summary.priority2 || 0,
          low: result.summary.priority3 || 0,
        },
      },
    }
  }

  const bugInstances = (result.bugInstances || result.bugs || []).map((bug: any) => ({
    ...bug,
    id: bug.id || `${bug.type}-${bug.sourceFile}-${bug.startLine}-${Math.random()}`,
    priority: bug.priority || 3,
    rank: bug.rank || 20,
    shortMessage: bug.shortMessage || bug.message || 'No short message',
    longMessage: bug.longMessage || bug.message || 'No long message',
    classes: bug.classes || [{ classname: bug.className || 'UnknownClass' }],
    methods: bug.methods || [],
    fields: bug.fields || [],
    localVariables: bug.localVariables || [],
    sourceLines: bug.sourceLines || [
      {
        classname: bug.className || 'UnknownClass',
        start: bug.startLine || bug.line || 0,
        end: bug.endLine || bug.line || 0,
        sourcefile: bug.sourceFile || 'UnknownFile.java',
        sourcepath: bug.sourcePath || 'UnknownFile.java',
        primary: true,
      },
    ],
    ints: bug.ints || [],
    strings: bug.strings || [],
    properties: bug.properties || [],
    className: bug.className || 'UnknownClass',
    sourceFile: bug.sourceFile || 'UnknownFile.java',
    startLine: bug.startLine || bug.line || 0,
    endLine: bug.endLine || bug.line || 0,
    message: bug.message || 'No message provided',
    details: bug.details || 'No details provided',
    categoryDescription: getCategoryDesc(bug.category) || 'Unknown category',
  }))

  const totalBugs = bugInstances.length
  const highPriority = bugInstances.filter((b: BugInstance) => b.priority === 1).length
  const mediumPriority = bugInstances.filter((b: BugInstance) => b.priority === 2).length
  const lowPriority = bugInstances.filter((b: BugInstance) => b.priority === 3).length

  return {
    version: result.version || { version: 'unknown', sequence: null, timestamp: null, analysisTimestamp: null, release: '' },
    project: result.project || { projectName: 'unknown', filename: '', jars: [], srcDirs: [] },
    summary: result.summary || {
      timestamp: new Date().toISOString(),
      totalClasses: 0,
      referencedClasses: 0,
      totalBugs: totalBugs,
      totalSize: 0,
      numPackages: 0,
      priority1: highPriority,
      priority2: mediumPriority,
      priority3: lowPriority,
    },
    fileStats: result.fileStats || [],
    packageStats: result.packageStats || [],
    errors: result.errors || { errors: 0, missingClasses: 0, missingClassList: [] },
    bugCategories: result.bugCategories || {},
    bugPatterns: result.bugPatterns || {},
    bugCodes: result.bugCodes || {},
    bugInstances,
    bugCount: {
      total: totalBugs,
      byPriority: { high: highPriority, medium: mediumPriority, low: lowPriority },
    },
  }
}

export type FilterTab = 'all' | 'high' | 'medium' | 'low' | 'chart' | 'filelist'

export function filterBugsByTab(bugs: BugInstance[], tab: FilterTab): BugInstance[] {
  if (tab === 'all' || tab === 'chart' || tab === 'filelist') return bugs
  if (tab === 'high') return bugs.filter(b => b.priority === 1)
  if (tab === 'medium') return bugs.filter(b => b.priority === 2)
  if (tab === 'low') return bugs.filter(b => b.priority === 3)
  return bugs
}

export type SortKey = 'priority' | 'category' | 'sourceFile' | 'type' | ''
export type SortDirection = 'asc' | 'desc' | ''

export function sortBugs(bugs: BugInstance[], sortKey: SortKey, sortDirection: SortDirection): BugInstance[] {
  if (!sortKey || !sortDirection) return bugs
  const bugsToSort = [...bugs]
  return bugsToSort.sort((a: BugInstance, b: BugInstance) => {
    const aVal = (a as any)[sortKey] ?? ''
    const bVal = (b as any)[sortKey] ?? ''
    if (sortKey === 'priority') {
      const aNum = Number(aVal)
      const bNum = Number(bVal)
      if (aNum < bNum) return sortDirection === 'asc' ? -1 : 1
      if (aNum > bNum) return sortDirection === 'asc' ? 1 : -1
      return 0
    }
    const comparison = String(aVal).localeCompare(String(bVal))
    return sortDirection === 'asc' ? comparison : -comparison
  })
}

export function nextSortState(
  currentKey: SortKey,
  currentDirection: SortDirection,
  clickedKey: SortKey
): { sortKey: SortKey; sortDirection: SortDirection } {
  if (currentKey === clickedKey) {
    if (currentDirection === 'asc') return { sortKey: clickedKey, sortDirection: 'desc' }
    if (currentDirection === 'desc') return { sortKey: '', sortDirection: '' }
    return { sortKey: clickedKey, sortDirection: 'asc' }
  }
  return { sortKey: clickedKey, sortDirection: 'asc' }
}

export function buildCodeSnippet(
  content: string,
  startLine: number,
  endLine: number
): string {
  const lines = content.split('\n')
  const startIdx = Math.max(0, startLine - 6)
  const endIdx = Math.min(lines.length - 1, endLine + 4)
  return lines.slice(startIdx, endIdx + 1).join('\n')
}
