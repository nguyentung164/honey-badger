import axios from 'axios'
import { tCommitWorkflow } from './i18n'
import l from 'electron-log'
import type { CommitWorkflowSettings } from 'shared/commitWorkflow/types'
import configurationStore from '../store/ConfigurationStore'
import { sendTaskNotification } from '../notification/taskNotification'
import { query } from '../task/schema/db'

async function getNotifyUserIds(projectId: string, roles: Array<'pl' | 'pm' | 'admin'>): Promise<string[]> {
  const ids = new Set<string>()
  if (roles.includes('pl') || roles.includes('pm')) {
    const roleList = roles.filter(r => r === 'pl' || r === 'pm')
    const placeholders = roleList.map(() => '?').join(',')
    const rows = await query<{ user_id: string }>(
      `SELECT user_id FROM user_project_roles WHERE project_id = ? AND role IN (${placeholders})`,
      [projectId, ...roleList]
    )
    for (const r of rows) ids.add(r.user_id)
  }
  if (roles.includes('admin')) {
    const admins = await query<{ user_id: string }>('SELECT user_id FROM app_admins')
    for (const r of admins) ids.add(r.user_id)
  }
  return [...ids]
}

export async function notifyWorkflowFailure(input: {
  projectId: string
  runId: string
  commitHash: string
  settings: CommitWorkflowSettings
}): Promise<void> {
  const roles = input.settings.notifyOnFail ?? ['pl']
  if (!roles.length) return

  try {
    const userIds = await getNotifyUserIds(input.projectId, roles)
    const shortHash = input.commitHash.slice(0, 7)
    const title = tCommitWorkflow('failTitle')
    const body = tCommitWorkflow('failBody', { hash: shortHash })
    for (const uid of userIds) {
      sendTaskNotification(uid, title, body, 'commit-workflow-fail', { force: true })
    }

    const { enableTeamsNotification, webhookMS } = configurationStore.store
    if (enableTeamsNotification && webhookMS?.trim()) {
      await axios
        .post(
          webhookMS,
          {
            type: 'message',
            attachments: [
              {
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: {
                  type: 'AdaptiveCard',
                  version: '1.4',
                  body: [
                    { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', color: 'Attention' },
                    { type: 'TextBlock', text: body, wrap: true },
                  ],
                },
              },
            ],
          },
          { headers: { 'Content-Type': 'application/json' } }
        )
        .catch(err => l.warn('[commit-workflow] teams notify failed', err))
    }
  } catch (e) {
    l.warn('[commit-workflow] notify failure', e)
  }
}
