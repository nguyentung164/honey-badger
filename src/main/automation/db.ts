import type {
  AiRepairProposal,
  AutomationBrowser,
  CaseResultStatus,
  PageMapLastRunStatus,
  PageMapNodeStatus,
  RunScopeResolution,
  RunStatus,
  TestCase,
  TestCaseFailureStep,
  TestCaseReportStep,
  TestCaseResult,
  TestCatalogGroup,
  TestCatalogPage,
  TestFlow,
  TestPageMapAnnotation,
  TestPageNavEdge,
  TestProject,
  TestRunSummary,
  TestStep,
  TestSuite,
} from 'shared/automation/types'
import { parseConnectionStyleJson, parseNodeVisualStyleJson, stringifyNodeVisualStyle } from 'shared/flowDiagramStyle'
import { buildCasePageLookupMaps, resolvePageIdForCaseResult } from 'shared/automation/pageMapRunStatus'
import { parsePageMapAnnotationStyleJson, stringifyPageMapAnnotationStyle } from 'shared/pageMapAnnotationStyle'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { exec, query, type TransactionQuery, withTransaction } from '../task/schema/db'
import { getWorkspacePath } from './workspace'

interface ProjectRow {
  id: string
  name: string
  base_url: string
  description: string | null
  browsers: string[] | null
  workspace_path: string
  created_by: string | null
  created_at: string
  updated_at: string
}

function rowToProject(r: ProjectRow): TestProject {
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    description: r.description ?? undefined,
    browsers: (r.browsers ?? ['chromium']) as AutomationBrowser[],
    workspacePath: r.workspace_path,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listProjects(): Promise<TestProject[]> {
  const rows = await query<ProjectRow>(
    'SELECT id, name, base_url, description, browsers, workspace_path, created_by, created_at, updated_at FROM test_projects ORDER BY created_at DESC'
  )
  return rows.map(rowToProject)
}

export async function getProject(id: string): Promise<TestProject | null> {
  const rows = await query<ProjectRow>('SELECT id, name, base_url, description, browsers, workspace_path, created_by, created_at, updated_at FROM test_projects WHERE id = ?', [id])
  if (!rows.length) return null
  return rowToProject(rows[0])
}

export async function createProject(input: {
  name: string
  baseUrl: string
  description?: string
  browsers?: AutomationBrowser[]
  createdBy?: string | null
}): Promise<TestProject> {
  const id = randomUuidV7()
  const browsers = (input.browsers && input.browsers.length > 0 ? input.browsers : ['chromium']) as AutomationBrowser[]
  const workspacePath = getWorkspacePath(id)
  await exec('INSERT INTO test_projects (id, name, base_url, description, browsers, workspace_path, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    id,
    input.name,
    input.baseUrl,
    input.description ?? null,
    browsers,
    workspacePath,
    input.createdBy ?? null,
  ])
  const proj = await getProject(id)
  if (!proj) throw new Error('Failed to create project.')
  await ensureDefaultCatalogForProject(id)
  return proj
}

export async function updateProject(id: string, patch: Partial<Pick<TestProject, 'name' | 'baseUrl' | 'description' | 'browsers'>>): Promise<TestProject | null> {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.name !== undefined) {
    fields.push('name = ?')
    values.push(patch.name)
  }
  if (patch.baseUrl !== undefined) {
    fields.push('base_url = ?')
    values.push(patch.baseUrl)
  }
  if (patch.description !== undefined) {
    fields.push('description = ?')
    values.push(patch.description)
  }
  if (patch.browsers !== undefined) {
    fields.push('browsers = ?')
    values.push(patch.browsers)
  }
  if (fields.length === 0) return getProject(id)
  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  await exec(`UPDATE test_projects SET ${fields.join(', ')} WHERE id = ?`, values)
  return getProject(id)
}

export async function deleteProject(id: string): Promise<void> {
  await exec('DELETE FROM test_projects WHERE id = ?', [id])
}

// ----- Catalog: Page → Flow (test catalog) -----

interface CatalogPageRow {
  id: string
  project_id: string
  name: string
  slug: string | null
  description: string | null
  sort_order: number
  group_id: string | null
  diagram_x: string | number | null
  diagram_y: string | number | null
  diagram_style_json: string | null
  created_at: string
  updated_at: string
}

function rowToCatalogPage(r: CatalogPageRow): TestCatalogPage {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    slug: r.slug ?? undefined,
    description: r.description ?? undefined,
    sortOrder: r.sort_order,
    groupId: r.group_id ?? undefined,
    diagramX: r.diagram_x != null ? Number(r.diagram_x) : undefined,
    diagramY: r.diagram_y != null ? Number(r.diagram_y) : undefined,
    diagramStyle: parseNodeVisualStyleJson(r.diagram_style_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

interface CatalogGroupRow {
  id: string
  project_id: string
  parent_group_id: string | null
  name: string
  description: string | null
  sort_order: number
  diagram_x: string | number | null
  diagram_y: string | number | null
  diagram_width: string | number | null
  diagram_height: string | number | null
  diagram_style_json: string | null
  created_at: string
  updated_at: string
}

function rowToCatalogGroup(r: CatalogGroupRow): TestCatalogGroup {
  return {
    id: r.id,
    projectId: r.project_id,
    parentGroupId: r.parent_group_id ?? undefined,
    name: r.name,
    description: r.description ?? undefined,
    sortOrder: r.sort_order,
    diagramX: r.diagram_x != null ? Number(r.diagram_x) : undefined,
    diagramY: r.diagram_y != null ? Number(r.diagram_y) : undefined,
    diagramWidth: r.diagram_width != null ? Number(r.diagram_width) : undefined,
    diagramHeight: r.diagram_height != null ? Number(r.diagram_height) : undefined,
    diagramStyle: parseNodeVisualStyleJson(r.diagram_style_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

interface FlowRow {
  id: string
  page_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

function rowToFlow(r: FlowRow): TestFlow {
  return {
    id: r.id,
    pageId: r.page_id,
    name: r.name,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

interface NavEdgeRow {
  id: string
  project_id: string
  source_page_id: string
  target_page_id: string
  label: string | null
  style_json: string | null
  created_at: string
}

function rowToNavEdge(r: NavEdgeRow): TestPageNavEdge {
  return {
    id: r.id,
    projectId: r.project_id,
    sourcePageId: r.source_page_id,
    targetPageId: r.target_page_id,
    label: r.label ?? undefined,
    connectionStyle: parseConnectionStyleJson(r.style_json ?? undefined),
    createdAt: r.created_at,
  }
}

export async function ensureDefaultCatalogForProject(projectId: string): Promise<void> {
  const rows = await query<{ n: string }>('SELECT COUNT(*)::text AS n FROM test_catalog_pages WHERE project_id = ?', [projectId])
  const n = Number(rows[0]?.n ?? 0)
  if (n > 0) return
  const page = await createCatalogPage({ projectId, name: 'General', slug: 'general', sortOrder: 0 })
  await createFlow({ pageId: page.id, name: 'General', sortOrder: 0 })
}

export async function listCatalogPages(projectId: string): Promise<TestCatalogPage[]> {
  const rows = await query<CatalogPageRow>(
    `SELECT id, project_id, name, slug, description, sort_order, group_id, diagram_x, diagram_y, diagram_style_json, created_at, updated_at
     FROM test_catalog_pages WHERE project_id = ? ORDER BY sort_order ASC, name ASC`,
    [projectId]
  )
  return rows.map(rowToCatalogPage)
}

/** Số test case (có flow) theo từng catalog page — phục vụ page map không cần resolve selection. */
export async function caseCountByCatalogPageForProject(projectId: string): Promise<Record<string, number>> {
  const pages = await query<{ id: string }>(`SELECT id FROM test_catalog_pages WHERE project_id = ?`, [projectId])
  const out: Record<string, number> = {}
  for (const p of pages) out[p.id] = 0

  const rows = await query<{ page_id: string; n: string }>(
    `SELECT tf.page_id AS page_id, COUNT(*)::text AS n
     FROM test_cases tc
     INNER JOIN test_flows tf ON tf.id = tc.flow_id
     INNER JOIN test_catalog_pages cp ON cp.id = tf.page_id AND cp.project_id = ?
     GROUP BY tf.page_id`,
    [projectId]
  )
  for (const r of rows) out[r.page_id] = Number(r.n ?? 0)
  return out
}

export async function getCatalogPage(id: string): Promise<TestCatalogPage | null> {
  const rows = await query<CatalogPageRow>(
    `SELECT id, project_id, name, slug, description, sort_order, group_id, diagram_x, diagram_y, diagram_style_json, created_at, updated_at
     FROM test_catalog_pages WHERE id = ?`,
    [id]
  )
  return rows.length ? rowToCatalogPage(rows[0]) : null
}

export async function createCatalogPage(input: {
  projectId: string
  name: string
  slug?: string
  description?: string
  sortOrder?: number
  groupId?: string | null
}): Promise<TestCatalogPage> {
  const id = randomUuidV7()
  await exec(`INSERT INTO test_catalog_pages (id, project_id, name, slug, description, sort_order, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    id,
    input.projectId,
    input.name,
    input.slug ?? null,
    input.description ?? null,
    input.sortOrder ?? 0,
    input.groupId ?? null,
  ])
  const p = await getCatalogPage(id)
  if (!p) throw new Error('Failed to create catalog page.')
  return p
}

export async function updateCatalogPage(
  id: string,
  patch: Partial<Pick<TestCatalogPage, 'name' | 'slug' | 'description' | 'sortOrder' | 'groupId' | 'diagramX' | 'diagramY' | 'diagramStyle'>>
): Promise<TestCatalogPage | null> {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.name !== undefined) {
    fields.push('name = ?')
    values.push(patch.name)
  }
  if (patch.slug !== undefined) {
    fields.push('slug = ?')
    values.push(patch.slug)
  }
  if (patch.description !== undefined) {
    fields.push('description = ?')
    values.push(patch.description)
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?')
    values.push(patch.sortOrder)
  }
  if (patch.groupId !== undefined) {
    fields.push('group_id = ?')
    values.push(patch.groupId)
  }
  if (patch.diagramX !== undefined) {
    fields.push('diagram_x = ?')
    values.push(patch.diagramX)
  }
  if (patch.diagramY !== undefined) {
    fields.push('diagram_y = ?')
    values.push(patch.diagramY)
  }
  if (patch.diagramStyle !== undefined) {
    fields.push('diagram_style_json = ?')
    values.push(patch.diagramStyle == null ? null : stringifyNodeVisualStyle(patch.diagramStyle))
  }
  if (fields.length === 0) return getCatalogPage(id)
  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  await exec(`UPDATE test_catalog_pages SET ${fields.join(', ')} WHERE id = ?`, values)
  return getCatalogPage(id)
}

async function countCasesOnPage(pageId: string): Promise<number> {
  const rows = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM test_cases tc
     INNER JOIN test_flows tf ON tf.id = tc.flow_id
     WHERE tf.page_id = ?`,
    [pageId]
  )
  return Number(rows[0]?.n ?? 0)
}

export async function deleteCatalogPage(id: string): Promise<void> {
  const n = await countCasesOnPage(id)
  if (n > 0) throw new Error('Cannot delete page while it still has test cases. Move or delete cases first.')
  await exec('DELETE FROM test_catalog_pages WHERE id = ?', [id])
}

async function slugTakenInProjectTx(txQuery: TransactionQuery, projectId: string, slug: string): Promise<boolean> {
  const rows = (await txQuery('SELECT id FROM test_catalog_pages WHERE project_id = ? AND slug = ?', [projectId, slug])) as { id: string }[]
  return rows.length > 0
}

async function pickUniqueCatalogSlugTx(txQuery: TransactionQuery, projectId: string, preferred: string | null): Promise<string | null> {
  if (!preferred?.trim()) return null
  const base = preferred.trim()
  let candidate = base
  let i = 0
  while (await slugTakenInProjectTx(txQuery, projectId, candidate)) {
    i += 1
    candidate = i === 1 ? `${base}-copy` : `${base}-copy-${i}`
  }
  return candidate
}

async function pickUniqueCaseCodeTx(txQuery: TransactionQuery, projectId: string, baseCode: string): Promise<string> {
  let candidate = `${baseCode}-copy`
  let n = 0
  while (true) {
    const rows = (await txQuery('SELECT 1 FROM test_cases WHERE project_id = ? AND code = ?', [projectId, candidate])) as unknown[]
    if (!rows.length) return candidate
    n += 1
    candidate = `${baseCode}-copy${n}`
  }
}

/**
 * Deep-clone a catalog page: new page row, all flows, all cases (new ids/codes), same project.
 * Spec files are copied in the IPC layer using `codeMap`.
 */
export async function duplicateCatalogPageDeep(input: {
  sourcePageId: string
  name?: string
  slug?: string | null
  description?: string | null
}): Promise<{ newPageId: string; projectId: string; codeMap: Record<string, string> }> {
  const source = await getCatalogPage(input.sourcePageId)
  if (!source) throw new Error('Catalog page not found.')
  const projectId = source.projectId
  const flows = await listFlowsForPage(source.id)
  const allCases = await listCases(projectId)
  const flowIdSet = new Set(flows.map(f => f.id))
  const casesToClone = allCases.filter(c => c.flowId && flowIdSet.has(c.flowId))

  const newName = input.name?.trim() || `${source.name} (copy)`
  const desc = input.description !== undefined ? (input.description === null ? null : input.description) : (source.description ?? null)

  let preferredSlug: string | null
  if (input.slug !== undefined) {
    preferredSlug = input.slug?.trim() ? input.slug.trim() : null
  } else if (source.slug?.trim()) {
    preferredSlug = `${source.slug.trim()}-copy`
  } else {
    preferredSlug = null
  }

  return withTransaction(async (txQuery, txExec) => {
    const uniqueSlug = await pickUniqueCatalogSlugTx(txQuery, projectId, preferredSlug)

    const newPageId = randomUuidV7()
    await txExec(
      `INSERT INTO test_catalog_pages (id, project_id, name, slug, description, sort_order, group_id, diagram_x, diagram_y, diagram_style_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newPageId,
        projectId,
        newName,
        uniqueSlug,
        desc,
        source.sortOrder,
        source.groupId ?? null,
        (source.diagramX ?? 0) + 48,
        (source.diagramY ?? 0) + 48,
        source.diagramStyle ? stringifyNodeVisualStyle(source.diagramStyle) : null,
      ]
    )

    const oldFlowToNew = new Map<string, string>()
    for (const f of flows) {
      const nf = randomUuidV7()
      oldFlowToNew.set(f.id, nf)
      await txExec(`INSERT INTO test_flows (id, page_id, name, sort_order) VALUES (?, ?, ?, ?)`, [nf, newPageId, f.name, f.sortOrder])
    }

    const codeMap: Record<string, string> = {}

    for (const c of casesToClone) {
      const newCode = await pickUniqueCaseCodeTx(txQuery, projectId, c.code)
      codeMap[c.code] = newCode
      const newId = randomUuidV7()
      const newFlowId = c.flowId ? (oldFlowToNew.get(c.flowId) ?? null) : null
      const stepsJson = JSON.stringify(c.steps ?? [])
      const tagsArr = c.tags ?? []
      await txExec(
        `INSERT INTO test_cases (id, project_id, flow_id, code, title, priority, tags, preconditions, steps, expected, source, spec_status, ai_rationale)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?)`,
        [newId, projectId, newFlowId, newCode, c.title, c.priority, tagsArr, c.preconditions ?? null, stepsJson, c.expected, c.source, c.specStatus, c.aiRationale ?? null]
      )
    }

    return { newPageId, projectId, codeMap }
  })
}

export async function listFlowsForPage(pageId: string): Promise<TestFlow[]> {
  const rows = await query<FlowRow>(`SELECT id, page_id, name, sort_order, created_at, updated_at FROM test_flows WHERE page_id = ? ORDER BY sort_order ASC, name ASC`, [pageId])
  return rows.map(rowToFlow)
}

function strictDescendantGroupIds(rootId: string, groups: TestCatalogGroup[]): Set<string> {
  const children = new Map<string, string[]>()
  for (const g of groups) {
    const pid = g.parentGroupId ?? '__root__'
    if (!children.has(pid)) children.set(pid, [])
    children.get(pid)!.push(g.id)
  }
  const out = new Set<string>()
  const q = [...(children.get(rootId) ?? [])]
  while (q.length) {
    const x = q.shift()
    if (x === undefined) break
    if (out.has(x)) continue
    out.add(x)
    for (const c of children.get(x) ?? []) q.push(c)
  }
  return out
}

export async function listCatalogGroups(projectId: string): Promise<TestCatalogGroup[]> {
  const rows = await query<CatalogGroupRow>(
    `SELECT id, project_id, parent_group_id, name, description, sort_order, diagram_x, diagram_y, diagram_width, diagram_height, diagram_style_json, created_at, updated_at
     FROM test_catalog_groups WHERE project_id = ? ORDER BY sort_order ASC, name ASC`,
    [projectId]
  )
  return rows.map(rowToCatalogGroup)
}

export async function listCatalogGraph(projectId: string): Promise<{
  groups: TestCatalogGroup[]
  pages: TestCatalogPage[]
  groupCaseCounts: Record<string, number>
  annotations: TestPageMapAnnotation[]
}> {
  const [groups, pages, groupCaseCounts, annotations] = await Promise.all([
    listCatalogGroups(projectId),
    listCatalogPages(projectId),
    caseCountByCatalogGroupForProject(projectId),
    listPageMapAnnotations(projectId),
  ])
  return { groups, pages, groupCaseCounts, annotations }
}

interface PageMapAnnotationRow {
  id: string
  project_id: string
  content: string
  label_number: number
  diagram_x: number | null
  diagram_y: number | null
  diagram_width: number | null
  diagram_height: number | null
  style_json: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

function rowToPageMapAnnotation(r: PageMapAnnotationRow): TestPageMapAnnotation {
  return {
    id: r.id,
    projectId: r.project_id,
    content: r.content,
    labelNumber: r.label_number,
    diagramX: r.diagram_x ?? undefined,
    diagramY: r.diagram_y ?? undefined,
    diagramWidth: r.diagram_width ?? undefined,
    diagramHeight: r.diagram_height ?? undefined,
    style: parsePageMapAnnotationStyleJson(r.style_json),
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listPageMapAnnotations(projectId: string): Promise<TestPageMapAnnotation[]> {
  const rows = await query<PageMapAnnotationRow>(
    `SELECT id, project_id, content, label_number, diagram_x, diagram_y, diagram_width, diagram_height, style_json, sort_order, created_at, updated_at
     FROM test_page_map_annotations WHERE project_id = ? ORDER BY sort_order ASC, label_number ASC, created_at ASC`,
    [projectId]
  )
  return rows.map(rowToPageMapAnnotation)
}

export async function getPageMapAnnotation(id: string): Promise<TestPageMapAnnotation | null> {
  const rows = await query<PageMapAnnotationRow>(
    `SELECT id, project_id, content, label_number, diagram_x, diagram_y, diagram_width, diagram_height, style_json, sort_order, created_at, updated_at FROM test_page_map_annotations WHERE id = ?`,
    [id]
  )
  return rows.length ? rowToPageMapAnnotation(rows[0]) : null
}

export async function createPageMapAnnotation(input: {
  projectId: string
  content: string
  labelNumber?: number
  diagramX?: number
  diagramY?: number
  diagramWidth?: number
  diagramHeight?: number
  style?: TestPageMapAnnotation['style']
  sortOrder?: number
}): Promise<TestPageMapAnnotation> {
  let labelNumber = input.labelNumber
  if (labelNumber == null) {
    const rows = await query<{ max_n: number | null }>(
      `SELECT MAX(label_number)::int AS max_n FROM test_page_map_annotations WHERE project_id = ?`,
      [input.projectId]
    )
    labelNumber = (rows[0]?.max_n ?? 0) + 1
  }
  const id = randomUuidV7()
  await exec(
    `INSERT INTO test_page_map_annotations (id, project_id, content, label_number, diagram_x, diagram_y, diagram_width, diagram_height, style_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.projectId,
      input.content,
      labelNumber,
      input.diagramX ?? null,
      input.diagramY ?? null,
      input.diagramWidth ?? null,
      input.diagramHeight ?? null,
      stringifyPageMapAnnotationStyle(input.style),
      input.sortOrder ?? 0,
    ]
  )
  const row = await getPageMapAnnotation(id)
  if (!row) throw new Error('Failed to create map annotation.')
  return row
}

export async function duplicatePageMapAnnotation(sourceId: string): Promise<TestPageMapAnnotation | null> {
  const src = await getPageMapAnnotation(sourceId)
  if (!src) return null
  return createPageMapAnnotation({
    projectId: src.projectId,
    content: src.content,
    diagramX: (src.diagramX ?? 40) + 28,
    diagramY: (src.diagramY ?? 40) + 28,
    diagramWidth: src.diagramWidth,
    diagramHeight: src.diagramHeight,
    style: src.style,
    sortOrder: src.sortOrder,
  })
}

export async function updatePageMapAnnotation(
  id: string,
  patch: Partial<
    Pick<TestPageMapAnnotation, 'content' | 'labelNumber' | 'diagramX' | 'diagramY' | 'diagramWidth' | 'diagramHeight' | 'style' | 'sortOrder'>
  >
): Promise<TestPageMapAnnotation | null> {
  const cur = await getPageMapAnnotation(id)
  if (!cur) return null
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.content !== undefined) {
    fields.push('content = ?')
    values.push(patch.content)
  }
  if (patch.labelNumber !== undefined) {
    fields.push('label_number = ?')
    values.push(patch.labelNumber)
  }
  if (patch.diagramX !== undefined) {
    fields.push('diagram_x = ?')
    values.push(patch.diagramX)
  }
  if (patch.diagramY !== undefined) {
    fields.push('diagram_y = ?')
    values.push(patch.diagramY)
  }
  if (patch.diagramWidth !== undefined) {
    fields.push('diagram_width = ?')
    values.push(patch.diagramWidth)
  }
  if (patch.diagramHeight !== undefined) {
    fields.push('diagram_height = ?')
    values.push(patch.diagramHeight)
  }
  if (patch.style !== undefined) {
    fields.push('style_json = ?')
    values.push(stringifyPageMapAnnotationStyle(patch.style))
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?')
    values.push(patch.sortOrder)
  }
  if (!fields.length) return cur
  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  await exec(`UPDATE test_page_map_annotations SET ${fields.join(', ')} WHERE id = ?`, values)
  return getPageMapAnnotation(id)
}

export async function deletePageMapAnnotation(id: string): Promise<void> {
  await exec('DELETE FROM test_page_map_annotations WHERE id = ?', [id])
}

export async function getCatalogGroup(id: string): Promise<TestCatalogGroup | null> {
  const rows = await query<CatalogGroupRow>(
    `SELECT id, project_id, parent_group_id, name, description, sort_order, diagram_x, diagram_y, diagram_width, diagram_height, diagram_style_json, created_at, updated_at FROM test_catalog_groups WHERE id = ?`,
    [id]
  )
  return rows.length ? rowToCatalogGroup(rows[0]) : null
}

export async function createCatalogGroup(input: {
  projectId: string
  name: string
  parentGroupId?: string | null
  description?: string
  sortOrder?: number
}): Promise<TestCatalogGroup> {
  if (input.parentGroupId) {
    const parent = await getCatalogGroup(input.parentGroupId)
    if (!parent || parent.projectId !== input.projectId) throw new Error('Parent group not found or wrong project.')
  }
  const id = randomUuidV7()
  await exec(`INSERT INTO test_catalog_groups (id, project_id, parent_group_id, name, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)`, [
    id,
    input.projectId,
    input.parentGroupId ?? null,
    input.name,
    input.description ?? null,
    input.sortOrder ?? 0,
  ])
  const g = await getCatalogGroup(id)
  if (!g) throw new Error('Failed to create catalog group.')
  return g
}

export async function updateCatalogGroup(
  id: string,
  patch: Partial<Pick<TestCatalogGroup, 'name' | 'description' | 'sortOrder' | 'parentGroupId' | 'diagramX' | 'diagramY' | 'diagramWidth' | 'diagramHeight' | 'diagramStyle'>>
): Promise<TestCatalogGroup | null> {
  const cur = await getCatalogGroup(id)
  if (!cur) return null

  if (patch.parentGroupId !== undefined && patch.parentGroupId !== cur.parentGroupId) {
    const nextParent = patch.parentGroupId
    if (nextParent === id) throw new Error('Group cannot be its own parent.')
    if (nextParent) {
      const p = await getCatalogGroup(nextParent)
      if (!p || p.projectId !== cur.projectId) throw new Error('Parent group not found or wrong project.')
      const groups = await listCatalogGroups(cur.projectId)
      const desc = strictDescendantGroupIds(id, groups)
      if (desc.has(nextParent)) throw new Error('Cannot move group under its descendant.')
    }
  }

  const fields: string[] = []
  const values: unknown[] = []
  if (patch.name !== undefined) {
    fields.push('name = ?')
    values.push(patch.name)
  }
  if (patch.description !== undefined) {
    fields.push('description = ?')
    values.push(patch.description)
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?')
    values.push(patch.sortOrder)
  }
  if (patch.parentGroupId !== undefined) {
    fields.push('parent_group_id = ?')
    values.push(patch.parentGroupId)
  }
  if (patch.diagramX !== undefined) {
    fields.push('diagram_x = ?')
    values.push(patch.diagramX)
  }
  if (patch.diagramY !== undefined) {
    fields.push('diagram_y = ?')
    values.push(patch.diagramY)
  }
  if (patch.diagramWidth !== undefined) {
    fields.push('diagram_width = ?')
    values.push(patch.diagramWidth)
  }
  if (patch.diagramHeight !== undefined) {
    fields.push('diagram_height = ?')
    values.push(patch.diagramHeight)
  }
  if (patch.diagramStyle !== undefined) {
    fields.push('diagram_style_json = ?')
    values.push(patch.diagramStyle == null ? null : stringifyNodeVisualStyle(patch.diagramStyle))
  }
  if (fields.length === 0) return getCatalogGroup(id)
  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  await exec(`UPDATE test_catalog_groups SET ${fields.join(', ')} WHERE id = ?`, values)
  return getCatalogGroup(id)
}

/** Tổng diagramX/Y từ root tới group `groupId` (mỗi bước là offset tương đối parent). */
function catalogGroupAbsoluteOrigin(groupsById: Map<string, TestCatalogGroup>, groupId: string): { x: number; y: number } {
  let x = 0
  let y = 0
  let cur: string | null | undefined = groupId
  while (cur) {
    const node = groupsById.get(cur)
    if (!node) break
    x += Number(node.diagramX) || 0
    y += Number(node.diagramY) || 0
    cur = node.parentGroupId ?? null
  }
  return { x, y }
}

/**
 * Xoá khung nhóm: chuyển page & nhóm con trực tiếp lên parent (hoặc root), **cập nhật diagramX/Y**
 * để tọa độ vẫn đúng trên map (trước đây chỉ đổi FK nên page lệch khi ra ngoài group).
 */
export async function deleteCatalogGroup(id: string): Promise<void> {
  const g = await getCatalogGroup(id)
  if (!g) return
  const parentId = g.parentGroupId ?? null
  const groups = await listCatalogGroups(g.projectId)
  const pages = await listCatalogPages(g.projectId)
  const byId = new Map(groups.map(x => [x.id, x]))

  const absG = catalogGroupAbsoluteOrigin(byId, id)
  const absParent = parentId ? catalogGroupAbsoluteOrigin(byId, parentId) : { x: 0, y: 0 }

  for (const p of pages) {
    if (p.groupId !== id) continue
    const absPx = absG.x + (Number(p.diagramX) || 0)
    const absPy = absG.y + (Number(p.diagramY) || 0)
    const nx = parentId ? absPx - absParent.x : absPx
    const ny = parentId ? absPy - absParent.y : absPy
    await updateCatalogPage(p.id, { groupId: parentId, diagramX: nx, diagramY: ny })
  }

  for (const cg of groups) {
    if (cg.parentGroupId !== id) continue
    const absCx = absG.x + (Number(cg.diagramX) || 0)
    const absCy = absG.y + (Number(cg.diagramY) || 0)
    const ngx = parentId ? absCx - absParent.x : absCx
    const ngy = parentId ? absCy - absParent.y : absCy
    await updateCatalogGroup(cg.id, { parentGroupId: parentId, diagramX: ngx, diagramY: ngy })
  }

  await exec(`DELETE FROM test_catalog_groups WHERE id = ?`, [id])
}

export async function expandGroupIdsToPageIds(projectId: string, groupIds: string[]): Promise<string[]> {
  const unique = [...new Set(groupIds.filter(Boolean))]
  if (!unique.length) return []
  const gh = unique.map(() => '?').join(', ')
  const rows = await query<{ id: string }>(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM test_catalog_groups WHERE project_id = ? AND id IN (${gh})
       UNION ALL
       SELECT g.id FROM test_catalog_groups g
       INNER JOIN subtree s ON g.parent_group_id = s.id
     )
     SELECT DISTINCT p.id FROM test_catalog_pages p
     WHERE p.project_id = ? AND p.group_id IN (SELECT id FROM subtree)`,
    [projectId, ...unique, projectId]
  )
  return rows.map(r => r.id)
}

export async function caseCountByCatalogGroupForProject(projectId: string): Promise<Record<string, number>> {
  const [pages, groups, pageCounts] = await Promise.all([listCatalogPages(projectId), listCatalogGroups(projectId), caseCountByCatalogPageForProject(projectId)])
  const childrenByParent = new Map<string, string[]>()
  for (const g of groups) {
    const p = g.parentGroupId ?? '__root__'
    if (!childrenByParent.has(p)) childrenByParent.set(p, [])
    childrenByParent.get(p)!.push(g.id)
  }
  function subtreeGroupIds(rootId: string): Set<string> {
    const out = new Set<string>()
    const st = [rootId]
    while (st.length) {
      const id = st.pop()
      if (id === undefined) break
      if (out.has(id)) continue
      out.add(id)
      for (const c of childrenByParent.get(id) ?? []) st.push(c)
    }
    return out
  }
  const out: Record<string, number> = {}
  for (const g of groups) {
    const st = subtreeGroupIds(g.id)
    let n = 0
    for (const p of pages) {
      if (p.groupId && st.has(p.groupId)) n += pageCounts[p.id] ?? 0
    }
    out[g.id] = n
  }
  return out
}

export async function resolveRunScope(projectId: string, opts: { pageIds?: string[]; groupIds?: string[] }): Promise<RunScopeResolution> {
  const pageIds = [...new Set((opts.pageIds ?? []).filter(Boolean))]
  const requestedGroupIds = [...new Set((opts.groupIds ?? []).filter(Boolean))]
  const extraWarnings: string[] = []

  const mergedPageIds: string[] = [...pageIds]
  let validRequestedGroups: string[] = []
  if (requestedGroupIds.length) {
    const ph = requestedGroupIds.map(() => '?').join(', ')
    const validRows = await query<{ id: string }>(`SELECT id FROM test_catalog_groups WHERE project_id = ? AND id IN (${ph})`, [projectId, ...requestedGroupIds])
    const validSet = new Set(validRows.map(r => r.id))
    for (const gid of requestedGroupIds) {
      if (!validSet.has(gid)) extraWarnings.push(`Unknown or foreign catalog group id: ${gid}`)
    }
    validRequestedGroups = requestedGroupIds.filter(g => validSet.has(g))
    if (validRequestedGroups.length) {
      const expanded = await expandGroupIdsToPageIds(projectId, validRequestedGroups)
      const seen = new Set(mergedPageIds)
      for (const pid of expanded) {
        if (!seen.has(pid)) {
          seen.add(pid)
          mergedPageIds.push(pid)
        }
      }
    }
  }

  const base = await resolveRunScopeForCatalogPages(projectId, mergedPageIds)
  const warnings = [...extraWarnings, ...base.warnings]

  const caseIdsByGroupId: Record<string, string[]> = {}
  const caseCountByGroupId: Record<string, number> = {}
  for (const gid of validRequestedGroups) {
    const pageIdsForG = await expandGroupIdsToPageIds(projectId, [gid])
    const collected: string[] = []
    const seenCase = new Set<string>()
    for (const pid of pageIdsForG) {
      for (const cid of base.caseIdsByPageId[pid] ?? []) {
        if (seenCase.has(cid)) continue
        seenCase.add(cid)
        collected.push(cid)
      }
    }
    caseIdsByGroupId[gid] = collected
    caseCountByGroupId[gid] = collected.length
    if (collected.length === 0) {
      warnings.push(`No test cases under catalog group ${gid} (empty subtree or no cases on pages).`)
    }
  }

  return {
    ...base,
    warnings,
    pageIdsExpanded: mergedPageIds,
    caseIdsByGroupId: Object.keys(caseIdsByGroupId).length ? caseIdsByGroupId : undefined,
    caseCountByGroupId: Object.keys(caseCountByGroupId).length ? caseCountByGroupId : undefined,
  }
}

/**
 * Gom tất cả test case (có flow) thuộc các catalog page đã chọn trong project.
 */
export async function resolveRunScopeForCatalogPages(projectId: string, pageIds: string[]): Promise<RunScopeResolution> {
  const uniquePageIds = [...new Set(pageIds.filter(Boolean))]
  const warnings: string[] = []
  const caseIdsByPageId: Record<string, string[]> = {}
  const caseCountByPageId: Record<string, number> = {}

  if (uniquePageIds.length === 0) {
    return { caseIds: [], caseIdsByPageId, caseCountByPageId, pageIdsExpanded: [], warnings }
  }

  const placeholders = uniquePageIds.map(() => '?').join(', ')
  const validRows = await query<{ id: string }>(`SELECT id FROM test_catalog_pages WHERE project_id = ? AND id IN (${placeholders})`, [projectId, ...uniquePageIds])
  const validSet = new Set(validRows.map(r => r.id))
  for (const pid of uniquePageIds) {
    if (!validSet.has(pid)) {
      warnings.push(`Unknown or foreign catalog page id: ${pid}`)
    }
  }

  const validPageIds = uniquePageIds.filter(id => validSet.has(id))
  if (validPageIds.length === 0) {
    for (const pid of uniquePageIds) {
      if (!validSet.has(pid)) continue
      caseCountByPageId[pid] = 0
    }
    return { caseIds: [], caseIdsByPageId, caseCountByPageId, pageIdsExpanded: [], warnings }
  }

  const ph2 = validPageIds.map(() => '?').join(', ')
  const rows = await query<{ id: string; page_id: string }>(
    `SELECT tc.id, tf.page_id
     FROM test_cases tc
     INNER JOIN test_flows tf ON tf.id = tc.flow_id
     INNER JOIN test_catalog_pages p ON p.id = tf.page_id
     WHERE p.project_id = ? AND tf.page_id IN (${ph2})
     ORDER BY p.sort_order ASC, tc.code ASC`,
    [projectId, ...validPageIds]
  )

  const allIds: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    allIds.push(r.id)
    if (!caseIdsByPageId[r.page_id]) caseIdsByPageId[r.page_id] = []
    caseIdsByPageId[r.page_id].push(r.id)
  }

  for (const pid of uniquePageIds) {
    if (!validSet.has(pid)) continue
    const n = caseIdsByPageId[pid]?.length ?? 0
    caseCountByPageId[pid] = n
    if (n === 0) {
      warnings.push(`No test cases on catalog page ${pid} (add flows and cases).`)
    }
  }

  return { caseIds: allIds, caseIdsByPageId, caseCountByPageId, pageIdsExpanded: validPageIds, warnings }
}

export async function getFlow(id: string): Promise<TestFlow | null> {
  const rows = await query<FlowRow>(`SELECT id, page_id, name, sort_order, created_at, updated_at FROM test_flows WHERE id = ?`, [id])
  return rows.length ? rowToFlow(rows[0]) : null
}

export async function createFlow(input: { pageId: string; name: string; sortOrder?: number }): Promise<TestFlow> {
  const id = randomUuidV7()
  await exec(`INSERT INTO test_flows (id, page_id, name, sort_order) VALUES (?, ?, ?, ?)`, [id, input.pageId, input.name, input.sortOrder ?? 0])
  const f = await getFlow(id)
  if (!f) throw new Error('Failed to create flow.')
  return f
}

export async function updateFlow(id: string, patch: Partial<Pick<TestFlow, 'name' | 'sortOrder'>>): Promise<TestFlow | null> {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.name !== undefined) {
    fields.push('name = ?')
    values.push(patch.name)
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?')
    values.push(patch.sortOrder)
  }
  if (fields.length === 0) return getFlow(id)
  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  await exec(`UPDATE test_flows SET ${fields.join(', ')} WHERE id = ?`, values)
  return getFlow(id)
}

async function countCasesForFlow(flowId: string): Promise<number> {
  const rows = await query<{ n: string }>('SELECT COUNT(*)::text AS n FROM test_cases WHERE flow_id = ?', [flowId])
  return Number(rows[0]?.n ?? 0)
}

export async function deleteFlow(id: string): Promise<void> {
  const n = await countCasesForFlow(id)
  if (n > 0) throw new Error('Cannot delete flow while it still has test cases.')
  await exec('DELETE FROM test_flows WHERE id = ?', [id])
}

export async function listNavEdges(projectId: string): Promise<TestPageNavEdge[]> {
  const rows = await query<NavEdgeRow>(
    `SELECT id, project_id, source_page_id, target_page_id, label, style_json, created_at FROM test_page_nav_edges WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId]
  )
  return rows.map(rowToNavEdge)
}

export async function createNavEdge(input: { projectId: string; sourcePageId: string; targetPageId: string; label?: string }): Promise<TestPageNavEdge> {
  const src = await getCatalogPage(input.sourcePageId)
  const tgt = await getCatalogPage(input.targetPageId)
  if (!src || !tgt || src.projectId !== input.projectId || tgt.projectId !== input.projectId) {
    throw new Error('Invalid page ids for navigation edge.')
  }
  const id = randomUuidV7()
  await exec(`INSERT INTO test_page_nav_edges (id, project_id, source_page_id, target_page_id, label) VALUES (?, ?, ?, ?, ?)`, [
    id,
    input.projectId,
    input.sourcePageId,
    input.targetPageId,
    input.label ?? null,
  ])
  const rows = await query<NavEdgeRow>(`SELECT id, project_id, source_page_id, target_page_id, label, style_json, created_at FROM test_page_nav_edges WHERE id = ?`, [id])
  if (!rows.length) throw new Error('Failed to create edge.')
  return rowToNavEdge(rows[0])
}

export async function updateNavEdge(id: string, patch: { label?: string | null; styleJson?: string | null }): Promise<TestPageNavEdge | null> {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.label !== undefined) {
    fields.push('label = ?')
    values.push(patch.label)
  }
  if (patch.styleJson !== undefined) {
    fields.push('style_json = ?')
    values.push(patch.styleJson)
  }
  if (fields.length === 0) {
    const rows = await query<NavEdgeRow>(`SELECT id, project_id, source_page_id, target_page_id, label, style_json, created_at FROM test_page_nav_edges WHERE id = ?`, [id])
    return rows.length ? rowToNavEdge(rows[0]) : null
  }
  values.push(id)
  await exec(`UPDATE test_page_nav_edges SET ${fields.join(', ')} WHERE id = ?`, values)
  const rows = await query<NavEdgeRow>(`SELECT id, project_id, source_page_id, target_page_id, label, style_json, created_at FROM test_page_nav_edges WHERE id = ?`, [id])
  return rows.length ? rowToNavEdge(rows[0]) : null
}

export async function deleteNavEdge(id: string): Promise<void> {
  await exec('DELETE FROM test_page_nav_edges WHERE id = ?', [id])
}

interface CaseRow {
  id: string
  project_id: string
  flow_id: string | null
  code: string
  title: string
  priority: string
  tags: string[] | null
  preconditions: string | null
  steps: unknown
  expected: string
  source: string
  spec_status: string
  ai_rationale: string | null
  created_at: string
  updated_at: string
}

function parseSteps(value: unknown): TestStep[] {
  if (!value) return []
  if (Array.isArray(value)) return value as TestStep[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as TestStep[]) : []
    } catch {
      return []
    }
  }
  return []
}

function rowToCase(r: CaseRow): TestCase {
  return {
    id: r.id,
    projectId: r.project_id,
    flowId: r.flow_id ?? undefined,
    code: r.code,
    title: r.title,
    tags: r.tags ?? [],
    priority: r.priority as TestCase['priority'],
    preconditions: r.preconditions ?? undefined,
    steps: parseSteps(r.steps),
    expected: r.expected ?? '',
    source: r.source as TestCase['source'],
    specStatus: r.spec_status as TestCase['specStatus'],
    aiRationale: r.ai_rationale ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listCases(projectId: string): Promise<TestCase[]> {
  const rows = await query<CaseRow>(
    `SELECT id, project_id, flow_id, code, title, priority, tags, preconditions, steps, expected, source, spec_status, ai_rationale, created_at, updated_at
     FROM test_cases WHERE project_id = ? ORDER BY code ASC`,
    [projectId]
  )
  return rows.map(rowToCase)
}

export async function getCase(id: string): Promise<TestCase | null> {
  const rows = await query<CaseRow>(
    `SELECT id, project_id, flow_id, code, title, priority, tags, preconditions, steps, expected, source, spec_status, ai_rationale, created_at, updated_at
     FROM test_cases WHERE id = ?`,
    [id]
  )
  return rows.length ? rowToCase(rows[0]) : null
}

export async function getCaseByCode(projectId: string, code: string): Promise<TestCase | null> {
  const rows = await query<CaseRow>(
    `SELECT id, project_id, flow_id, code, title, priority, tags, preconditions, steps, expected, source, spec_status, ai_rationale, created_at, updated_at
     FROM test_cases WHERE project_id = ? AND code = ?`,
    [projectId, code]
  )
  return rows.length ? rowToCase(rows[0]) : null
}

export async function upsertCases(projectId: string, cases: TestCase[]): Promise<TestCase[]> {
  const saved: TestCase[] = []
  for (const c of cases) {
    const existing = await getCaseByCode(projectId, c.code)
    const id = existing?.id ?? c.id
    const tagsArr = c.tags ?? []
    const stepsJson = JSON.stringify(c.steps ?? [])
    const flowId = existing && c.flowId === undefined ? (existing.flowId ?? null) : (c.flowId ?? null)
    if (existing) {
      await exec(
        `UPDATE test_cases
         SET title = ?, priority = ?, tags = ?, preconditions = ?, steps = ?::jsonb, expected = ?, source = ?, spec_status = ?, ai_rationale = ?, flow_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [c.title, c.priority, tagsArr, c.preconditions ?? null, stepsJson, c.expected, c.source, c.specStatus, c.aiRationale ?? null, flowId, id]
      )
    } else {
      await exec(
        `INSERT INTO test_cases (id, project_id, flow_id, code, title, priority, tags, preconditions, steps, expected, source, spec_status, ai_rationale)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?)`,
        [id, projectId, flowId, c.code, c.title, c.priority, tagsArr, c.preconditions ?? null, stepsJson, c.expected, c.source, c.specStatus, c.aiRationale ?? null]
      )
    }
    const next = await getCase(id)
    if (next) saved.push(next)
  }
  return saved
}

export async function deleteCase(id: string): Promise<void> {
  await exec('DELETE FROM test_cases WHERE id = ?', [id])
}

export async function setCaseSpecStatus(id: string, status: TestCase['specStatus']): Promise<void> {
  await exec('UPDATE test_cases SET spec_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id])
}

interface SuiteRow {
  id: string
  project_id: string
  name: string
  description: string | null
  tag_filter: string | null
}

function rowToSuite(r: SuiteRow): TestSuite {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    description: r.description ?? undefined,
    tagFilter: r.tag_filter ?? undefined,
  }
}

export async function listSuites(projectId: string): Promise<TestSuite[]> {
  const rows = await query<SuiteRow>('SELECT id, project_id, name, description, tag_filter FROM test_suites WHERE project_id = ? ORDER BY name ASC', [projectId])
  return rows.map(rowToSuite)
}

export async function createSuite(input: Omit<TestSuite, 'id'>): Promise<TestSuite> {
  const id = randomUuidV7()
  await exec('INSERT INTO test_suites (id, project_id, name, description, tag_filter) VALUES (?, ?, ?, ?, ?)', [
    id,
    input.projectId,
    input.name,
    input.description ?? null,
    input.tagFilter ?? null,
  ])
  return { id, ...input }
}

export async function updateSuite(id: string, patch: Partial<Omit<TestSuite, 'id' | 'projectId'>>): Promise<void> {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.name !== undefined) {
    fields.push('name = ?')
    values.push(patch.name)
  }
  if (patch.description !== undefined) {
    fields.push('description = ?')
    values.push(patch.description)
  }
  if (patch.tagFilter !== undefined) {
    fields.push('tag_filter = ?')
    values.push(patch.tagFilter)
  }
  if (fields.length === 0) return
  values.push(id)
  await exec(`UPDATE test_suites SET ${fields.join(', ')} WHERE id = ?`, values)
}

export async function deleteSuite(id: string): Promise<void> {
  await exec('DELETE FROM test_suites WHERE id = ?', [id])
}

interface RunRow {
  id: string
  project_id: string
  status: string
  browsers: string[] | null
  workers: number
  retries: number
  grep: string | null
  total: number
  passed: number
  failed: number
  skipped: number
  flaky: number
  duration_ms: string | number
  started_at: string | null
  finished_at: string | null
  triggered_by: string | null
  report_path: string | null
  junit_path: string | null
  json_path: string | null
  cancel_reason: string | null
}

function rowToRun(r: RunRow): TestRunSummary {
  return {
    id: r.id,
    projectId: r.project_id,
    status: r.status as RunStatus,
    browsers: (r.browsers ?? ['chromium']) as AutomationBrowser[],
    workers: r.workers,
    retries: r.retries,
    grep: r.grep ?? undefined,
    total: r.total,
    passed: r.passed,
    failed: r.failed,
    skipped: r.skipped,
    flaky: r.flaky,
    durationMs: Number(r.duration_ms ?? 0),
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
    triggeredBy: r.triggered_by ?? undefined,
    reportPath: r.report_path ?? undefined,
    junitPath: r.junit_path ?? undefined,
    jsonPath: r.json_path ?? undefined,
    cancelReason: r.cancel_reason ?? undefined,
  }
}

export async function insertQueuedRun(summary: TestRunSummary): Promise<void> {
  await exec(
    `INSERT INTO test_runs (id, project_id, status, browsers, workers, retries, grep, started_at, triggered_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      summary.id,
      summary.projectId,
      summary.status,
      summary.browsers,
      summary.workers,
      summary.retries,
      summary.grep ?? null,
      summary.startedAt ?? null,
      summary.triggeredBy ?? null,
    ]
  )
}

/** Chuẩn hoá số ms cho cột Postgres BIGINT (Playwright đôi khi trả float). */
function toRoundedMs(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

function toSafeInt(value: unknown, fallback = 0): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return n
}

export async function finalizeRun(summary: TestRunSummary): Promise<void> {
  await exec(
    `UPDATE test_runs
     SET status = ?, total = ?, passed = ?, failed = ?, skipped = ?, flaky = ?, duration_ms = ?, finished_at = ?, report_path = ?, junit_path = ?, json_path = ?, cancel_reason = ?
     WHERE id = ?`,
    [
      summary.status,
      toSafeInt(summary.total),
      toSafeInt(summary.passed),
      toSafeInt(summary.failed),
      toSafeInt(summary.skipped),
      toSafeInt(summary.flaky),
      toRoundedMs(summary.durationMs),
      summary.finishedAt ?? null,
      summary.reportPath ?? null,
      summary.junitPath ?? null,
      summary.jsonPath ?? null,
      summary.cancelReason ?? null,
      summary.id,
    ]
  )
}

export async function listRuns(projectId: string, limit = 50): Promise<TestRunSummary[]> {
  const rows = await query<RunRow>(
    `SELECT id, project_id, status, browsers, workers, retries, grep, total, passed, failed, skipped, flaky, duration_ms, started_at, finished_at, triggered_by, report_path, junit_path, json_path, cancel_reason
     FROM test_runs WHERE project_id = ? ORDER BY started_at DESC NULLS LAST, created_at DESC LIMIT ?`,
    [projectId, limit]
  )
  return rows.map(rowToRun)
}

export async function getRunSummary(runId: string): Promise<TestRunSummary | null> {
  const rows = await query<RunRow>(
    `SELECT id, project_id, status, browsers, workers, retries, grep, total, passed, failed, skipped, flaky, duration_ms, started_at, finished_at, triggered_by, report_path, junit_path, json_path, cancel_reason
     FROM test_runs WHERE id = ?`,
    [runId]
  )
  return rows.length ? rowToRun(rows[0]) : null
}

interface ResultRow {
  id: string
  run_id: string
  case_id: string | null
  case_code: string | null
  test_title: string | null
  spec_file: string | null
  browser: string
  status: string
  duration_ms: string | number
  attempts: number
  error_message: string | null
  trace_path: string | null
  screenshot_paths: string[] | null
  video_path: string | null
  stdout_path: string | null
  failure_steps: string | null
  report_steps: string | null
}

function parseReportStepsJson(raw: string | null | undefined): TestCaseReportStep[] | undefined {
  if (!raw?.trim()) return undefined
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v) || v.length === 0) return undefined
    const out: TestCaseReportStep[] = []
    for (const item of v) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'Step'
      const category = typeof o.category === 'string' && o.category.trim() ? o.category.trim() : undefined
      const dm = o.durationMs ?? o.duration_ms
      let durationMs: number | undefined
      if (typeof dm === 'number' && Number.isFinite(dm)) durationMs = Math.round(dm)
      else if (typeof dm === 'string' && dm.trim()) {
        const n = parseInt(dm, 10)
        if (Number.isFinite(n)) durationMs = n
      }
      const depthN = o.depth
      const depth =
        typeof depthN === 'number' && Number.isFinite(depthN) && depthN >= 0
          ? Math.min(64, Math.floor(depthN))
          : typeof depthN === 'string'
            ? Math.min(64, Math.max(0, parseInt(depthN, 10) || 0))
            : 0
      const failed = o.failed === true
      const es = o.errorSnippet ?? o.error_snippet
      const errorSnippet = typeof es === 'string' && es.trim() ? es.trim() : undefined
      const locRaw = o.location
      let location: TestCaseReportStep['location']
      if (locRaw && typeof locRaw === 'object') {
        const L = locRaw as Record<string, unknown>
        const file = typeof L.file === 'string' ? L.file : undefined
        if (file) {
          const lineN = typeof L.line === 'number' && Number.isFinite(L.line) ? L.line : typeof L.line === 'string' ? parseInt(L.line, 10) : NaN
          const colN = typeof L.column === 'number' && Number.isFinite(L.column) ? L.column : typeof L.column === 'string' ? parseInt(L.column, 10) : NaN
          location = {
            file,
            line: Number.isFinite(lineN) ? lineN : undefined,
            column: Number.isFinite(colN) ? colN : undefined,
          }
        }
      }
      const hn = o.hasNestedSteps ?? o.has_nested_steps
      const hasNestedSteps = hn === true ? true : undefined
      out.push({ title, category, durationMs, depth, failed: failed || undefined, errorSnippet, location, hasNestedSteps })
    }
    return out.length > 0 ? out : undefined
  } catch {
    return undefined
  }
}

function parseFailureStepsJson(raw: string | null | undefined): TestCaseFailureStep[] | undefined {
  if (!raw?.trim()) return undefined
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v) || v.length === 0) return undefined
    const out: TestCaseFailureStep[] = []
    for (const item of v) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const label = typeof o.label === 'string' ? o.label : 'Step'
      const message = typeof o.message === 'string' ? o.message : ''
      const sp = o.screenshotPaths
      const screenshotPaths = Array.isArray(sp) ? sp.filter((x): x is string => typeof x === 'string') : []
      const fh = o.failureHighlightPaths ?? (o as { failure_highlight_paths?: unknown }).failure_highlight_paths
      const failureHighlightPaths = Array.isArray(fh) ? fh.filter((x): x is string => typeof x === 'string') : []
      const ec = o.errorContext ?? (o as { error_context?: unknown }).error_context
      const errorContext = typeof ec === 'string' && ec.trim() ? ec.trim() : undefined
      const summary = typeof o.summary === 'string' && o.summary.trim() ? o.summary.trim() : undefined
      const locRaw = o.location ?? (o as { error_location?: unknown }).error_location
      let location: TestCaseFailureStep['location']
      if (locRaw && typeof locRaw === 'object') {
        const L = locRaw as Record<string, unknown>
        const file = typeof L.file === 'string' ? L.file : undefined
        if (file) {
          const lineN = typeof L.line === 'number' && Number.isFinite(L.line) ? L.line : typeof L.line === 'string' ? parseInt(L.line, 10) : NaN
          const colN = typeof L.column === 'number' && Number.isFinite(L.column) ? L.column : typeof L.column === 'string' ? parseInt(L.column, 10) : NaN
          location = {
            file,
            line: Number.isFinite(lineN) ? lineN : undefined,
            column: Number.isFinite(colN) ? colN : undefined,
          }
        }
      }
      const hintsRaw = o.assertionHints ?? (o as { assertion_hints?: unknown }).assertion_hints
      let assertionHints: TestCaseFailureStep['assertionHints']
      if (hintsRaw && typeof hintsRaw === 'object') {
        const H = hintsRaw as Record<string, unknown>
        const locator = typeof H.locator === 'string' && H.locator.trim() ? H.locator.trim() : undefined
        const expected = typeof H.expected === 'string' && H.expected.trim() ? H.expected.trim() : undefined
        const received = typeof H.received === 'string' && H.received.trim() ? H.received.trim() : undefined
        if (locator || expected || received) assertionHints = { locator, expected, received }
      }
      out.push({
        label,
        message,
        summary,
        location,
        assertionHints,
        screenshotPaths,
        failureHighlightPaths: failureHighlightPaths.length > 0 ? failureHighlightPaths : undefined,
        errorContext,
      })
    }
    return out.length > 0 ? out : undefined
  } catch {
    return undefined
  }
}

function rowToResult(r: ResultRow): TestCaseResult {
  return {
    id: r.id,
    runId: r.run_id,
    caseId: r.case_id ?? '',
    caseCode: r.case_code ?? undefined,
    testTitle: r.test_title ?? undefined,
    specFile: r.spec_file ?? undefined,
    browser: r.browser as AutomationBrowser,
    status: r.status as TestCaseResult['status'],
    durationMs: Number(r.duration_ms ?? 0),
    attempts: r.attempts,
    errorMessage: r.error_message ?? undefined,
    failureSteps: parseFailureStepsJson(r.failure_steps),
    reportSteps: parseReportStepsJson(r.report_steps),
    tracePath: r.trace_path ?? undefined,
    screenshotPaths: r.screenshot_paths ?? [],
    videoPath: r.video_path ?? undefined,
    stdoutPath: r.stdout_path ?? undefined,
  }
}

export async function insertCaseResults(runId: string, rows: Array<Omit<TestCaseResult, 'id' | 'runId' | 'caseId'> & { caseId?: string | null }>): Promise<void> {
  for (const row of rows) {
    await exec(
      `INSERT INTO test_case_results (id, run_id, case_id, case_code, test_title, spec_file, browser, status, duration_ms, attempts, error_message, failure_steps, report_steps, trace_path, screenshot_paths, video_path, stdout_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUuidV7(),
        runId,
        row.caseId ?? null,
        row.caseCode ?? null,
        row.testTitle ?? null,
        row.specFile ?? null,
        row.browser,
        row.status,
        toRoundedMs(row.durationMs),
        toSafeInt(row.attempts, 1),
        row.errorMessage ?? null,
        row.failureSteps?.length ? JSON.stringify(row.failureSteps) : null,
        row.reportSteps?.length ? JSON.stringify(row.reportSteps) : null,
        row.tracePath ?? null,
        row.screenshotPaths ?? [],
        row.videoPath ?? null,
        row.stdoutPath ?? null,
      ]
    )
  }
}

export async function listResults(runId: string): Promise<TestCaseResult[]> {
  const rows = await query<ResultRow>(
    `SELECT id, run_id, case_id, case_code, test_title, spec_file, browser, status, duration_ms, attempts, error_message, failure_steps, report_steps, trace_path, screenshot_paths, video_path, stdout_path
     FROM test_case_results WHERE run_id = ? ORDER BY browser ASC, status ASC`,
    [runId]
  )
  return rows.map(rowToResult)
}

export async function getResult(id: string): Promise<TestCaseResult | null> {
  const rows = await query<ResultRow>(
    `SELECT id, run_id, case_id, case_code, test_title, spec_file, browser, status, duration_ms, attempts, error_message, failure_steps, report_steps, trace_path, screenshot_paths, video_path, stdout_path
     FROM test_case_results WHERE id = ?`,
    [id]
  )
  return rows.length ? rowToResult(rows[0]) : null
}

interface ProposalRow {
  id: string
  case_result_id: string
  original_spec: string
  proposed_spec: string
  rationale: string | null
  status: string
  created_at: string
}

function rowToProposal(r: ProposalRow): AiRepairProposal {
  return {
    id: r.id,
    caseResultId: r.case_result_id,
    originalSpec: r.original_spec,
    proposedSpec: r.proposed_spec,
    rationale: r.rationale ?? '',
    status: r.status as AiRepairProposal['status'],
    createdAt: r.created_at,
  }
}

export async function insertRepairProposal(input: Omit<AiRepairProposal, 'id' | 'createdAt' | 'status'>): Promise<AiRepairProposal> {
  const id = randomUuidV7()
  await exec('INSERT INTO ai_repair_proposals (id, case_result_id, original_spec, proposed_spec, rationale, status) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    input.caseResultId,
    input.originalSpec,
    input.proposedSpec,
    input.rationale ?? null,
    'pending',
  ])
  const rows = await query<ProposalRow>('SELECT id, case_result_id, original_spec, proposed_spec, rationale, status, created_at FROM ai_repair_proposals WHERE id = ?', [id])
  return rowToProposal(rows[0])
}

export async function updateRepairStatus(id: string, status: AiRepairProposal['status']): Promise<void> {
  await exec('UPDATE ai_repair_proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id])
}

export async function listRepairProposalsByResult(caseResultId: string): Promise<AiRepairProposal[]> {
  const rows = await query<ProposalRow>(
    'SELECT id, case_result_id, original_spec, proposed_spec, rationale, status, created_at FROM ai_repair_proposals WHERE case_result_id = ? ORDER BY created_at DESC',
    [caseResultId]
  )
  return rows.map(rowToProposal)
}

/** Lấy N run gần nhất để retention scheduler dùng. */
export async function listOldRunIds(projectId: string, keep: number): Promise<string[]> {
  const rows = await query<{ id: string }>('SELECT id FROM test_runs WHERE project_id = ? ORDER BY started_at DESC NULLS LAST, created_at DESC OFFSET ?', [projectId, keep])
  return rows.map(r => r.id)
}

export async function listAllProjectIds(): Promise<string[]> {
  const rows = await query<{ id: string }>('SELECT id FROM test_projects')
  return rows.map(r => r.id)
}

/** Xoá mọi run (và cascade test_case_results, ai_repair_proposals) của project. */
export async function deleteAllRunsForProject(projectId: string): Promise<void> {
  await exec('DELETE FROM test_runs WHERE project_id = ?', [projectId])
}

export async function deleteRunCascade(runId: string): Promise<void> {
  await exec('DELETE FROM test_runs WHERE id = ?', [runId])
}

const CASE_RESULT_FAIL = new Set<CaseResultStatus>(['failed', 'flaky', 'timedOut', 'interrupted'])

function caseFailedFromResults(results: TestCaseResult[]): boolean {
  return results.some(r => CASE_RESULT_FAIL.has(r.status))
}

function pageStatusFromCaseOutcomes(failed: boolean, hasResults: boolean, runStatus: RunStatus): PageMapNodeStatus {
  if (!hasResults) return 'idle'
  if (failed) return 'error'
  if (runStatus === 'cancelled') return 'cancelled'
  return 'done'
}

/** Derive page map statuses from the latest completed run in DB for a project. */
export async function getPageMapStatusFromLatestRun(projectId: string): Promise<PageMapLastRunStatus> {
  const runRows = await query<{ id: string; status: string; finished_at: string | null }>(
    `SELECT id, status, finished_at
     FROM test_runs
     WHERE project_id = ? AND status NOT IN ('queued', 'running')
     ORDER BY COALESCE(finished_at, created_at) DESC, created_at DESC
     LIMIT 1`,
    [projectId]
  )
  if (!runRows.length) {
    return { runId: null, runStatus: null, finishedAt: null, pageStatus: {} }
  }

  const runRow = runRows[0]
  const runStatus = runRow.status as RunStatus
  const results = await listResults(runRow.id)

  const casePageRows = await query<{ case_id: string; case_code: string; page_id: string }>(
    `SELECT tc.id AS case_id, tc.code AS case_code, tf.page_id
     FROM test_cases tc
     INNER JOIN test_flows tf ON tf.id = tc.flow_id
     INNER JOIN test_catalog_pages cp ON cp.id = tf.page_id
     WHERE cp.project_id = ?`,
    [projectId]
  )

  const pageMaps = buildCasePageLookupMaps(casePageRows)

  const resultsByCase = new Map<string, TestCaseResult[]>()
  for (const result of results) {
    const key = result.caseId?.trim() || (result.caseCode?.trim() ? `code:${result.caseCode.trim()}` : result.id)
    const bucket = resultsByCase.get(key)
    if (bucket) bucket.push(result)
    else resultsByCase.set(key, [result])
  }

  const pageFailed = new Map<string, boolean>()
  const pageHasResults = new Map<string, boolean>()

  for (const [, caseResults] of resultsByCase) {
    const sample = caseResults[0]
    const pageId = resolvePageIdForCaseResult(sample, pageMaps)
    if (!pageId) continue
    pageHasResults.set(pageId, true)
    if (caseFailedFromResults(caseResults)) pageFailed.set(pageId, true)
  }

  const pageStatus: Record<string, PageMapNodeStatus> = {}
  for (const [pageId, hasResults] of pageHasResults) {
    pageStatus[pageId] = pageStatusFromCaseOutcomes(pageFailed.get(pageId) === true, hasResults, runStatus)
  }

  return {
    runId: runRow.id,
    runStatus,
    finishedAt: runRow.finished_at ?? null,
    pageStatus,
  }
}
