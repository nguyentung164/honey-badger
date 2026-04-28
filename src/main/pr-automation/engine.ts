import axios from 'axios'
import { BrowserWindow } from 'electron'
import l from 'electron-log'
import { minimatch } from 'minimatch'
import { IPC } from '../constants'
import { githubClient } from '../git-hosting/github'
import configurationStore from '../store/ConfigurationStore'
import type { PullRequestSummary } from '../git-hosting/types'
import type { PrCheckpointTemplate } from '../task/mysqlPrTrackingStore'
import {
  getPrRepoById,
  getTrackedBranchById,
  listAutomationsForTrigger,
  listCheckpointKeysForRepoPr,
  listCheckpointTemplates,
  upsertBranchCheckpoint,
  upsertTrackedBranch,
} from '../task/mysqlPrTrackingStore'

export interface PrMergedEvent {
  repoId: string
  projectId: string
  prNumber: number
  sourceBranch: string
  targetBranch: string
  /** Link PR tr\u00ean GitHub (tr\u00e1nh c\u1ed9t pr_* tr\u1ed1ng khi merge m\u00e0 ch\u01b0a c\u00f3 record t\u1ea1o PR). */
  prUrl?: string | null
  /** T\u1eeb GET /pulls/... \u2014 c\u1eadp nh\u1eadt c\u1ed9t l\u1ecdc (draft / merged / \u2026) tr\u00ean checkpoint pr_*. */
  github?: { draft: boolean; state: 'open' | 'closed'; merged: boolean } | null
  /** GitHub `user.login` c\u1ee7a PR \u2014 hi\u1ec3n th\u1ecb c\u1ed9t ng\u01b0\u1eddi t\u1ea1o. */
  prAuthor?: string | null
  mergedBy?: string | null
  mergedAt?: string | null
  /** Title PR v\u1eeba merge \u2014 d\u00f9ng cho template {mergedPrTitle} / {chainedPrTitle}. */
  prTitle?: string | null
}

export interface AutomationResult {
  automationId: string
  triggered: boolean
  error?: string
  newPrNumber?: number
  newPrUrl?: string
}

function broadcast(channel: string, payload: unknown): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  } catch (err) {
    l.warn('PR automation broadcast failed:', err)
  }
}

function renderTemplate(
  tpl: string | null | undefined,
  vars: Record<string, string | undefined | null>
): string | undefined {
  if (!tpl) return undefined
  return tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k]
    return v == null ? '' : String(v)
  })
}

/** Title PR n\u1ed1i ti\u1ebfp: thay l\u1ea7n xu\u1ea5t hi\u1ec7n cu\u1ed1i c\u00f9ng c\u1ee7a (targetBranch) b\u1eb1ng (nextTarget), kh\u00f4ng ph\u00e2n bi\u1ec7t hoa th\u01b0\u1eddng. */
export function chainedPrTitleFromMerged(
  mergedTitle: string | null | undefined,
  targetBranch: string,
  nextTarget: string
): string {
  const t = mergedTitle?.trim()
  if (!t) return ''
  const esc = targetBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\(${esc}\\)`, 'gi')
  const matches = [...t.matchAll(re)]
  if (matches.length === 0) return t
  const last = matches[matches.length - 1]
  const start = last.index ?? 0
  const end = start + (last[0]?.length ?? 0)
  return t.slice(0, start) + `(${nextTarget})` + t.slice(end)
}

async function notifyTeamsAutomationFired(args: {
  repoName: string
  sourceBranch: string
  fromBase: string
  toBase: string
  prUrl: string
}): Promise<void> {
  const { webhookMS } = configurationStore.store
  if (!webhookMS) return
  try {
    const card = {
      $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.5',
      msteams: { width: 'Full' },
      body: [
        {
          type: 'TextBlock',
          size: 'Large',
          weight: 'Bolder',
          color: 'accent',
          text: 'PR Automation Fired',
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Repo', value: args.repoName },
            { title: 'Branch', value: args.sourceBranch },
            { title: 'After merge', value: args.fromBase },
            { title: 'Auto-created PR to', value: args.toBase },
          ],
        },
        {
          type: 'TextBlock',
          text: `[Open PR](${args.prUrl})`,
          wrap: true,
        },
      ],
    }
    const payload = {
      type: 'message',
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }],
    }
    await axios.post(webhookMS, payload, { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    l.warn('Teams notify failed:', err)
  }
}

function normBranch(b: string): string {
  return b.trim().toLowerCase()
}

function findMergedTemplateIdFromList(
  templates: PrCheckpointTemplate[],
  targetBranch: string,
  mode: 'merge' | 'pr'
): string | null {
  const nb = normBranch(targetBranch)
  const preferredCode = `${mode}_${nb}`
  const byCode = templates.find(t => t.code.toLowerCase() === preferredCode)
  if (byCode) return byCode.id
  const byTarget = templates.find(
    t =>
      t.targetBranch != null &&
      normBranch(t.targetBranch) === nb &&
      t.code.toLowerCase().startsWith(mode)
  )
  return byTarget?.id ?? null
}

/** Tìm template code khớp với target branch — ưu tiên code 'pr_<target>' hay 'merge_<target>'. */
async function findMergedTemplateId(
  userId: string,
  projectId: string,
  targetBranch: string,
  mode: 'merge' | 'pr',
): Promise<string | null> {
  const templates = await listCheckpointTemplates(userId, projectId)
  return findMergedTemplateIdFromList(templates, targetBranch, mode)
}

/**
 * Fire event PR \u0111\u00e3 merge. Th\u1ef1c hi\u1ec7n:
 * 1) c\u1eadp nh\u1eadt checkpoint "merge_<target>" \u2192 is_done=true, merged_at, merged_by
 * 2) duy\u1ec7t t\u1ea5t c\u1ea3 automation active kh\u1edbp pattern & target \u2192 t\u1ea1o PR chain sang next_target
 * 3) l\u01b0u checkpoint "pr_<next_target>" m\u1edbi
 * 4) broadcast IPC event cho UI refresh + notify Teams
 */
export async function onPrMerged(event: PrMergedEvent): Promise<AutomationResult[]> {
  const results: AutomationResult[] = []
  try {
    const repo = await getPrRepoById(event.repoId)
    if (!repo) return results

    const tracked = await upsertTrackedBranch({
      userId: repo.userId,
      projectId: event.projectId,
      repoId: event.repoId,
      branchName: event.sourceBranch,
    })

    const mergeTplId = await findMergedTemplateId(repo.userId, event.projectId, event.targetBranch, 'merge')
    if (mergeTplId) {
      const mUrl = event.prUrl?.trim() || `https://github.com/${repo.owner}/${repo.repo}/pull/${event.prNumber}`
      await upsertBranchCheckpoint({
        trackedBranchId: tracked.id,
        templateId: mergeTplId,
        isDone: true,
        prNumber: event.prNumber,
        prUrl: mUrl,
        mergedAt: event.mergedAt ?? new Date().toISOString().replace('T', ' ').substring(0, 19),
        mergedBy: event.mergedBy ?? null,
      })
      broadcast(IPC.PR.EVENT_CHECKPOINT_UPDATED, {
        trackedBranchId: tracked.id,
        templateId: mergeTplId,
      })
    }

    // C\u1ed9t pr_* (Created): n\u1ebfu user t\u1ea1o/merge PR ngo\u00e0i app ho\u1eb7c record l\u00fac t\u1ea1o th\u1ea5t b\u1ea1i, merge_* \u0111\u00e3 c\u00f3 m\u00e0 pr_* v\u1eabn tr\u1ed1ng \u2192 \u0111\u1ed3ng b\u1ed9 c\u00f9ng s\u1ed1 PR.
    const prTplId = await findMergedTemplateId(repo.userId, event.projectId, event.targetBranch, 'pr')
    if (prTplId) {
      const prUrl =
        event.prUrl?.trim() ||
        `https://github.com/${repo.owner}/${repo.repo}/pull/${event.prNumber}`
      const gh = event.github
      await upsertBranchCheckpoint({
        trackedBranchId: tracked.id,
        templateId: prTplId,
        isDone: true,
        prNumber: event.prNumber,
        prUrl,
        ...(gh
          ? { ghPrDraft: gh.draft, ghPrState: gh.state, ghPrMerged: gh.merged }
          : { ghPrDraft: false, ghPrState: 'closed' as const, ghPrMerged: true }),
        ...(typeof event.prAuthor !== 'undefined' ? { ghPrAuthor: event.prAuthor } : {}),
      })
      broadcast(IPC.PR.EVENT_CHECKPOINT_UPDATED, {
        trackedBranchId: tracked.id,
        templateId: prTplId,
      })
    }

    const automations = await listAutomationsForTrigger(event.repoId, 'pr_merged')
    for (const auto of automations) {
      if (auto.action !== 'create_pr' || !auto.nextTarget) continue
      if (auto.targetBranch && auto.targetBranch !== event.targetBranch) continue
      if (auto.sourcePattern && !minimatch(event.sourceBranch, auto.sourcePattern)) continue

      try {
        let lastCommit: string | null = null
        try {
          lastCommit = await githubClient.getLatestCommitMessage(
            repo.owner,
            repo.repo,
            event.sourceBranch
          )
        } catch {}
        const chainedTitle = chainedPrTitleFromMerged(event.prTitle, event.targetBranch, auto.nextTarget)
        const varsTitle: Record<string, string> = {
          branch: event.sourceBranch,
          sourceBranch: event.sourceBranch,
          from: event.targetBranch,
          targetBranch: event.targetBranch,
          to: auto.nextTarget,
          nextTarget: auto.nextTarget,
          prNumber: String(event.prNumber),
          lastCommit: lastCommit?.split('\n')[0] ?? event.sourceBranch,
          mergedPrTitle: event.prTitle?.trim() ?? '',
          chainedPrTitle: chainedTitle,
        }
        const varsBody: Record<string, string> = {
          ...varsTitle,
          lastCommit: lastCommit ?? '',
        }
        const renderedTitle = renderTemplate(auto.prTitleTemplate, varsTitle)?.trim()
        const title =
          (renderedTitle && renderedTitle.length > 0 ? renderedTitle : undefined) ||
          (chainedTitle.trim() || undefined) ||
          `Auto PR: ${event.sourceBranch} \u2192 ${auto.nextTarget}`
        const body =
          renderTemplate(auto.prBodyTemplate, varsBody) ||
          `Auto-created by PR Manager after merging \`${event.sourceBranch}\` into \`${event.targetBranch}\`.`

        const pr = await githubClient.createPR({
          owner: repo.owner,
          repo: repo.repo,
          title,
          body,
          head: event.sourceBranch,
          base: auto.nextTarget,
        })

        const nextPrTplId = await findMergedTemplateId(repo.userId, event.projectId, auto.nextTarget, 'pr')
        if (nextPrTplId) {
          await upsertBranchCheckpoint({
            trackedBranchId: tracked.id,
            templateId: nextPrTplId,
            isDone: true,
            prNumber: pr.number,
            prUrl: pr.htmlUrl,
            ghPrAuthor: pr.author ?? null,
            ghPrDraft: pr.draft,
            ghPrState: pr.state,
            ghPrMerged: pr.merged,
          })
        }
        results.push({
          automationId: auto.id,
          triggered: true,
          newPrNumber: pr.number,
          newPrUrl: pr.htmlUrl,
        })
        broadcast(IPC.PR.EVENT_AUTOMATION_FIRED, {
          automationId: auto.id,
          repoId: event.repoId,
          sourceBranch: event.sourceBranch,
          from: event.targetBranch,
          to: auto.nextTarget,
          prNumber: pr.number,
          prUrl: pr.htmlUrl,
        })
        void notifyTeamsAutomationFired({
          repoName: `${repo.owner}/${repo.repo}`,
          sourceBranch: event.sourceBranch,
          fromBase: event.targetBranch,
          toBase: auto.nextTarget,
          prUrl: pr.htmlUrl,
        })
      } catch (err: any) {
        l.error('PR automation failed:', err?.message)
        results.push({
          automationId: auto.id,
          triggered: false,
          error: err?.message || 'Unknown error',
        })
      }
    }
  } catch (err) {
    l.error('onPrMerged error:', err)
  }
  return results
}

/**
 * \u0110\u1ed3ng b\u1ed9 Board t\u1eeb m\u1ed9t PR tr\u00ean GitHub (open ho\u1eb7c \u0111\u00e3 merge/close):
 * ghi pr_* v\u00e0 n\u1ebfu merged th\u00ec ghi merge_*.
 */
/**
 * C\u1eadp nh\u1eadt m\u1ecdi checkpoint DB tr\u00f9ng owner/repo + s\u1ed1 PR theo b\u1ea3n t\u00f3m t\u1eaft GitHub; broadcast \u0111\u1ec3 board g\u1ecdi refreshTracked.
 * D\u00f9ng sau draft/ready/close/update branch (trackedList kh\u00f4ng g\u1ecdi API GitHub).
 */
export async function syncPullRequestIntoTrackedCheckpoints(
  owner: string,
  repo: string,
  pr: PullRequestSummary
): Promise<void> {
  const keys = await listCheckpointKeysForRepoPr(owner, repo, pr.number)
  for (const k of keys) {
    await upsertBranchCheckpoint({
      trackedBranchId: k.trackedBranchId,
      templateId: k.templateId,
      ghPrDraft: pr.draft,
      ghPrState: pr.state,
      ghPrMerged: pr.merged,
      ghPrAuthor: pr.author ?? null,
      ghPrTitle: pr.title ?? null,
      ghPrUpdatedAt: pr.updatedAt ?? null,
      ghPrAdditions: pr.additions ?? null,
      ghPrDeletions: pr.deletions ?? null,
      ghPrChangedFiles: pr.changedFiles ?? null,
      ghPrMergeableState: pr.mergeableState ?? null,
      ghPrAssignees: pr.assignees ?? null,
      ghPrLabels: pr.labels ?? null,
    })
    broadcast(IPC.PR.EVENT_CHECKPOINT_UPDATED, {
      trackedBranchId: k.trackedBranchId,
      templateId: k.templateId,
    })
  }
}

export async function applyPullRequestToCheckpoints(args: {
  projectId: string
  repoId: string
  pr: PullRequestSummary
  /** Sync hàng loạt: tránh gọi listCheckpointTemplates mỗi PR. */
  templatesCache?: PrCheckpointTemplate[]
}): Promise<void> {
  const branchName = args.pr.head
  if (!branchName) return

  const target = args.pr.base
  if (!target) return

  const repoRow = await getPrRepoById(args.repoId)
  if (!repoRow) return

  const templates =
    args.templatesCache ?? (await listCheckpointTemplates(repoRow.userId, args.projectId))
  const prTplId = findMergedTemplateIdFromList(templates, target, 'pr')
  const mergeTplId = args.pr.merged ? findMergedTemplateIdFromList(templates, target, 'merge') : null
  if (!prTplId && !mergeTplId) return

  const tracked = await upsertTrackedBranch({
    userId: repoRow.userId,
    projectId: args.projectId,
    repoId: args.repoId,
    branchName,
  })
  if (prTplId) {
    await upsertBranchCheckpoint({
      trackedBranchId: tracked.id,
      templateId: prTplId,
      isDone: true,
      prNumber: args.pr.number,
      prUrl: args.pr.htmlUrl,
      ghPrDraft: args.pr.draft,
      ghPrState: args.pr.state,
      ghPrMerged: args.pr.merged,
      ghPrAuthor: args.pr.author ?? null,
      ghPrTitle: args.pr.title ?? null,
      ghPrUpdatedAt: args.pr.updatedAt ?? null,
      ghPrAdditions: args.pr.additions ?? null,
      ghPrDeletions: args.pr.deletions ?? null,
      ghPrChangedFiles: args.pr.changedFiles ?? null,
      ghPrMergeableState: args.pr.mergeableState ?? null,
      ghPrAssignees: args.pr.assignees ?? null,
      ghPrLabels: args.pr.labels ?? null,
    })
    broadcast(IPC.PR.EVENT_CHECKPOINT_UPDATED, {
      trackedBranchId: tracked.id,
      templateId: prTplId,
    })
  }

  if (args.pr.merged && args.pr.mergedAt && mergeTplId) {
    await upsertBranchCheckpoint({
      trackedBranchId: tracked.id,
      templateId: mergeTplId,
      isDone: true,
      prNumber: args.pr.number,
      prUrl: args.pr.htmlUrl,
      mergedAt: args.pr.mergedAt,
      mergedBy: args.pr.mergedBy ?? null,
    })
    broadcast(IPC.PR.EVENT_CHECKPOINT_UPDATED, {
      trackedBranchId: tracked.id,
      templateId: mergeTplId,
    })
  }
}

/** Fallback \u0111\u1ec3 chuy\u1ec3n checkpoint \u0111\u00e3 c\u00f3 pr_number sang is_done=true khi merged \u0111\u1ee3c ph\u00e1t hi\u1ec7n. */
export async function markCheckpointMerged(args: {
  trackedBranchId: string
  templateId: string
  prNumber: number
  mergedAt: string
  mergedBy?: string | null
}): Promise<void> {
  await upsertBranchCheckpoint({
    trackedBranchId: args.trackedBranchId,
    templateId: args.templateId,
    isDone: true,
    prNumber: args.prNumber,
    mergedAt: args.mergedAt,
    mergedBy: args.mergedBy ?? null,
  })
  broadcast(IPC.PR.EVENT_CHECKPOINT_UPDATED, {
    trackedBranchId: args.trackedBranchId,
    templateId: args.templateId,
  })
}

// re-export helper
export { getTrackedBranchById }
