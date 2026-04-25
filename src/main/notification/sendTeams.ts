import path from 'node:path'
import { randomUuidV7 } from 'shared/randomUuidV7'
import os from 'node:os'
import axios from 'axios'
import { app } from 'electron'
import l from 'electron-log'
import type { CommitInfo, SupportFeedback } from 'main/types/types'
import configurationStore from '../store/ConfigurationStore'
import { uploadImagesToOneDrive } from '../utils/oneDriveUploader'

function createCommitInfoCard(data: CommitInfo) {
  const {
    commitUser,
    commitTime,
    commitMessage,
    addedFiles,
    modifiedFiles,
    deletedFiles,
    hasCheckCodingRule,
    hasCheckSpotbugs,
    commitHash,
    revision,
    branchName,
    projectName,
    insertions,
    deletions,
  } = data
  const { sourceFolder } = configurationStore.store
  const projectNameVal = projectName ?? (sourceFolder ? path.basename(sourceFolder) : undefined)
  const totalFiles = addedFiles.length + modifiedFiles.length + deletedFiles.length
  const statsParts: string[] = []
  if (insertions != null) statsParts.push(`+${insertions}`)
  if (deletions != null) statsParts.push(`-${deletions}`)
  const statsStr = statsParts.length > 0 ? statsParts.join(' ') : undefined
  const commitIdLabel = data.vcsType === 'svn' ? 'Revision' : 'Commit Hash'
  const commitIdVal = commitHash ?? (revision ? `r${revision}` : undefined)

  const facts: { title: string; value: string }[] = [
    { title: 'Commit User', value: commitUser },
    { title: 'Commit Time', value: commitTime },
    ...(commitIdVal ? [{ title: commitIdLabel, value: commitIdVal }] : []),
    ...(branchName ? [{ title: 'Branch', value: branchName }] : []),
    ...(projectNameVal ? [{ title: 'Project', value: projectNameVal }] : []),
    { title: 'Coding Rule', value: hasCheckCodingRule ? '✅ Đã kiểm tra' : '❌ Không kiểm tra' },
    { title: 'Spotbugs', value: hasCheckSpotbugs ? '✅ Đã kiểm tra' : '❌ Không kiểm tra' },
    { title: 'Total Files', value: String(totalFiles) },
    ...(statsStr ? [{ title: 'Stats', value: statsStr }] : []),
  ]
  const baseCard: any = {
    $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    msteams: { width: 'Full' },
    body: [
      {
        type: 'FactSet',
        facts,
      },
    ],
    actions: [
      {
        type: 'Action.ShowCard',
        title: 'View Commit Message',
        iconUrl: 'icon:Textbox',
        card: {
          type: 'AdaptiveCard',
          body: [
            {
              type: 'TextBlock',
              text: commitMessage.split('\n').join('\n\n'),
              wrap: true,
            },
          ],
        },
      },
      {
        type: 'Action.ShowCard',
        title: 'View Changed Files',
        iconUrl: 'icon:DocumentBulletList',
        card: {
          type: 'AdaptiveCard',
          body: [],
        },
      },
    ],
  }

  const changedFilesCard: any[] = []

  if (addedFiles.length > 0) {
    changedFilesCard.push({
      type: 'TextBlock',
      text: `### Added Files (${addedFiles.length}):`,
      weight: 'bolder',
      wrap: true,
      color: 'good',
    })
    changedFilesCard.push({
      type: 'Container',
      items: addedFiles.map((file, i) => ({
        type: 'TextBlock',
        text: `${i + 1}. ${file}`,
        wrap: true,
        spacing: 'None',
      })),
    })
  }

  if (modifiedFiles.length > 0) {
    changedFilesCard.push({
      type: 'TextBlock',
      text: `### Modified Files (${modifiedFiles.length}):`,
      weight: 'bolder',
      wrap: true,
      color: 'accent',
    })
    changedFilesCard.push({
      type: 'Container',
      items: modifiedFiles.map((file, i) => ({
        type: 'TextBlock',
        text: `${i + 1}. ${file}`,
        wrap: true,
        spacing: 'None',
      })),
    })
  }

  if (deletedFiles.length > 0) {
    changedFilesCard.push({
      type: 'TextBlock',
      text: `### Deleted Files (${deletedFiles.length}):`,
      weight: 'bolder',
      wrap: true,
      color: 'attention',
    })
    changedFilesCard.push({
      type: 'Container',
      items: deletedFiles.map((file, i) => ({
        type: 'TextBlock',
        text: `${i + 1}. ${file}`,
        wrap: true,
        spacing: 'None',
      })),
    })
  }

  baseCard.actions[1].card.body = changedFilesCard
  l.info('✅ Adaptive card created!')
  return baseCard
}

export async function sendTeams(data: CommitInfo): Promise<void> {
  try {
    const { webhookMS } = configurationStore.store
    if (!webhookMS) {
      l.warn('MS Teams Webhook URL chưa cấu hình, bỏ qua gửi notification.')
      return
    }
    l.info('🎯 Sending card to MS Teams...')
    const adaptiveCard = createCommitInfoCard(data)
    const payload = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: adaptiveCard,
        },
      ],
    }

    const response = await axios.post(webhookMS, payload, {
      headers: { 'Content-Type': 'application/json' },
    })

    if (response.status < 300) {
      l.info('✅ Adaptive card sent to MS Teams successfully!')
    } else {
      l.error(`Failed to send adaptive card to MS Teams: ${response.status}`)
    }
  } catch (err) {
    l.error(`Error sending adaptive card: ${err}`)
  }
}
function createSupportFeedbackCard(data: SupportFeedback, folderUrl: string) {
  const { type, email, message } = data
  const cardType = type === 'support' ? 'Support Request' : 'Feedback Submission'
  const cardColor = type === 'support' ? 'warning' : 'accent'

  const bodyElements: any[] = [
    {
      type: 'TextBlock',
      text: `**${cardType}**`,
      size: 'Large',
      weight: 'Bolder',
      color: cardColor,
    },
    {
      type: 'FactSet',
      facts: [
        { title: 'From', value: email },
        { title: 'Username', value: os.userInfo().username },
        { title: 'OS', value: `${os.type()} ${os.release()}` },
        { title: 'Locale', value: Intl.DateTimeFormat().resolvedOptions().locale },
        { title: 'App Version', value: app.getVersion() },
      ],
      separator: true,
    },
    {
      type: 'TextBlock',
      text: '**Message:**',
      wrap: true,
    },
    {
      type: 'TextBlock',
      text: message,
      wrap: true,
    },
  ]

  if (folderUrl) {
    bodyElements.push({
      type: 'TextBlock',
      text: `**Images Folder**: [${folderUrl}](${folderUrl})`,
      wrap: true,
      isSubtle: true,
    })
  }

  return {
    $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    msteams: { width: 'Full' },
    body: bodyElements,
  }
}

export async function sendSupportFeedbackToTeams(data: SupportFeedback): Promise<{ success: boolean; error?: string }> {
  try {
    l.info('🎯 Sending Support/Feedback card to MS Teams...')
    const { webhookMS, oneDriveClientId, oneDriveRefreshToken } = configurationStore.store
    if (!webhookMS) {
      l.error('MS Teams Webhook URL is not configured.')
      return { success: false, error: 'MS Teams Webhook URL is not configured.' }
    }
    let folderUrl = ''
    if (data.images && data.images.length > 0) {
      try {
        if (!oneDriveClientId || !oneDriveRefreshToken) {
          l.warn('OneDrive is not fully configured. Images will be skipped.')
          return { success: false, error: 'OneDrive chưa được cấu hình đầy đủ. Vui lòng kiểm tra Client ID và Refresh Token trong phần cài đặt OneDrive.' }
        }
        const feedbackUuid = randomUuidV7()
        l.info(`Uploading ${data.images.length} images to OneDrive folder with UUID: ${feedbackUuid}...`)
        folderUrl = await uploadImagesToOneDrive(data.images, feedbackUuid)
        l.info(`Successfully uploaded to ${folderUrl}`)
      } catch (uploadError: any) {
        l.error('Error uploading images to OneDrive:', uploadError)
      }
    }
    const adaptiveCard = createSupportFeedbackCard(data, folderUrl)
    const payload = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: adaptiveCard,
        },
      ],
    }
    const response = await axios.post(webhookMS, payload, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (response.status < 300) {
      l.info('✅ Support/Feedback card sent to MS Teams successfully!')
      return { success: true }
    }
    l.error(`Failed to send Support/Feedback card to MS Teams: ${response.status}`)
    return { success: false, error: `Failed to send message (Status: ${response.status})` }
  } catch (err: any) {
    l.error(`Error sending Support/Feedback card: ${err.message}`)
    return { success: false, error: err.message || 'An unknown error occurred' }
  }
}
