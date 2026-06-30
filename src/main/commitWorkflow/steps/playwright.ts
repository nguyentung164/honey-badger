import type { CommitWorkflowSettings, PlaywrightStepSummary } from 'shared/commitWorkflow/types'
import { cancelRun, isRunBusy, startRun, getActiveRunIdForProject } from '../../automation/runner'
import { getCatalogPage, getProject, resolveTestProjectForTaskProject } from '../../automation/db'
import { getAutomationSettings, getProjectSecrets } from '../../automation/settingsStore'
import { detectInstalledBrowsers } from '../../automation/workspace'
import type { AutomationBrowser, RunRequest } from 'shared/automation/types'

export type PlaywrightStepResult = {
  status: 'pass' | 'fail' | 'skipped' | 'error'
  summary: PlaywrightStepSummary | null
  message?: string
  needsBrowserInstall?: boolean
}

export async function runPlaywrightStep(input: {
  settings: CommitWorkflowSettings
  /** Task project (`projects.id`) from commit workflow run — resolved to test_projects. */
  taskProjectId?: string | null
  userId: string
  signal?: AbortSignal
}): Promise<PlaywrightStepResult> {
  if (input.signal?.aborted) return { status: 'error', summary: null, message: 'Cancelled' }

  const pageId = input.settings.catalogPageId?.trim() || input.settings.pageIds?.[0]?.trim()

  let project: Awaited<ReturnType<typeof getProject>> = null
  if (pageId) {
    const page = await getCatalogPage(pageId)
    if (page?.projectId) project = await getProject(page.projectId)
  }
  if (!project) {
    project =
      (input.taskProjectId?.trim()
        ? await resolveTestProjectForTaskProject(input.taskProjectId.trim())
        : null) ??
      (input.settings.automationProjectId?.trim()
        ? await getProject(input.settings.automationProjectId.trim())
        : null)
  }

  if (!project) {
    return {
      status: 'skipped',
      summary: null,
      message: 'No Playwright test project linked to this task project',
    }
  }

  const projectId = project.id

  const installed = await detectInstalledBrowsers()
  if (installed.length === 0) {
    return {
      status: 'error',
      summary: null,
      message: 'Playwright browsers not installed',
      needsBrowserInstall: true,
    }
  }

  if (isRunBusy(projectId)) {
    const activeId = getActiveRunIdForProject(projectId)
    if (activeId) cancelRun(activeId, 'commit-workflow-preempt')
    await new Promise(r => setTimeout(r, 500))
  }

  const pageIdResolved = pageId
  if (!pageIdResolved) {
    return { status: 'skipped', summary: null, message: 'No catalog page selected for Playwright' }
  }

  const autoSettings = getAutomationSettings()
  const browsers: AutomationBrowser[] = installed.includes('chromium') ? ['chromium'] : [installed[0]]
  const flowId = input.settings.catalogFlowId?.trim() || input.settings.flowIds?.[0]?.trim()
  const request: RunRequest = {
    projectId,
    browsers,
    workers: autoSettings.defaultWorkers ?? 1,
    retries: autoSettings.defaultRetries ?? 0,
    triggeredBy: input.userId,
    pageIds: [pageIdResolved],
    ...(flowId ? { flowIds: [flowId] } : {}),
  }

  try {
    const secrets = await getProjectSecrets(projectId)
    const secretEnv: Record<string, string> = {}
    for (const [k, v] of Object.entries(secrets ?? {})) {
      if (typeof v === 'string') secretEnv[k] = v
    }
    const { start, outcome } = await startRun({ project, request, secretEnv })
    const result = await outcome
    const passed = result.parsed?.summary.passed ?? 0
    const failed = result.parsed?.summary.failed ?? 0
    const skipped = result.parsed?.summary.skipped ?? 0
    const flaky = result.parsed?.summary.flaky ?? 0
    const summary: PlaywrightStepSummary = {
      testRunId: start.runId,
      passed,
      failed,
      skipped,
      flaky,
      pass: failed === 0,
    }
    if (input.signal?.aborted) return { status: 'error', summary, message: 'Cancelled' }
    return { status: summary.pass ? 'pass' : 'fail', summary }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('already has an active run')) {
      return { status: 'error', summary: null, message: msg }
    }
    return { status: 'error', summary: null, message: msg }
  }
}
