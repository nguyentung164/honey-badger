import { Notification } from 'electron'
import l from 'electron-log'
import configurationStore from '../store/ConfigurationStore'
import { getResourcePath } from '../utils/utils'

/** Commit hash đã thông báo - tránh gửi thông báo trùng lặp cho cùng commit */
let lastNotifiedGitCommitHash: string | null = null

import { updateGitCommitStatus } from '../windows/overlayStateManager'
import { formatGitError, getGitInstance } from './utils'

interface GitCheckUpdatesResponse {
  status: 'success' | 'error' | 'no-change'
  message?: string
  data?: {
    behind: number
    ahead: number
    latestCommit?: {
      hash: string
      author: string
      date: string
      subject: string
    }
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * Check if there are new commits available from remote
 * This function should be called after fetch() to check for updates
 * @param cwd - Working directory for git repo. If not provided, uses sourceFolder from config.
 */
export async function checkForUpdates(cwd?: string): Promise<GitCheckUpdatesResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Checking for Git updates')

    // Get current branch status
    const statusResult = await git.status()
    const behind = statusResult.behind || 0
    const ahead = statusResult.ahead || 0

    l.info(`Git status: behind=${behind}, ahead=${ahead}`)

    if (behind > 0) {
      // There are new commits available
      try {
        // Get the latest remote commit info
        const tracking = statusResult.tracking
        if (tracking) {
          // Get remote commit details
          const logCommand = ['log', '-1', '--format=%H|||%an|||%aI|||%s', tracking]
          const logResult = await git.raw(logCommand)

          const parts = logResult.trim().split('|||')
          if (parts.length >= 4) {
            const latestCommit = {
              hash: parts[0].substring(0, 8),
              author: parts[1],
              date: parts[2],
              subject: parts[3],
            }

            l.info(`New commit available: ${latestCommit.hash} by ${latestCommit.author}`)

            // Update overlay status
            updateGitCommitStatus(true)

            // Chỉ thông báo khi commit mới chưa từng thông báo (tránh spam)
            const fullHash = parts[0]
            const { showNotifications } = configurationStore.store
            const shouldNotify = showNotifications && fullHash !== lastNotifiedGitCommitHash
            if (shouldNotify && Notification.isSupported()) {
              lastNotifiedGitCommitHash = fullHash
              const icon = getResourcePath('icon.ico')
              const formattedDate = formatDate(latestCommit.date)
              const bodyLines = [
                `${behind} commit${behind > 1 ? 's' : ''} behind`,
                `${behind} commit${behind > 1 ? 's' : ''} need PL review`,
                `Latest: ${latestCommit.subject}`,
                `Author: ${latestCommit.author}`,
                `Date: ${formattedDate}`,
              ]

              new Notification({
                title: 'Git Update Available',
                body: bodyLines.join('\n'),
                icon: icon,
              }).show()
            }

            return {
              status: 'success',
              data: {
                behind,
                ahead,
                latestCommit,
              },
            }
          }
        }

        // Fallback if we can't get commit details
        updateGitCommitStatus(true)

        const fallbackKey = `fallback:${behind}`
        const { showNotifications } = configurationStore.store
        const shouldNotify = showNotifications && fallbackKey !== lastNotifiedGitCommitHash
        if (shouldNotify && Notification.isSupported()) {
          lastNotifiedGitCommitHash = fallbackKey
          const icon = getResourcePath('icon.ico')
          new Notification({
            title: 'Git Update Available',
            body: `${behind} commit${behind > 1 ? 's' : ''} available to pull. ${behind} commit(s) need PL review.`,
            icon: icon,
          }).show()
        }

        return {
          status: 'success',
          data: {
            behind,
            ahead,
          },
        }
      } catch (notificationError) {
        l.error('Failed to process Git update notification:', notificationError)
        // Still update status even if notification fails
        updateGitCommitStatus(true)
        return {
          status: 'success',
          data: {
            behind,
            ahead,
          },
        }
      }
    } else {
      // No new commits (đã sync)
      l.info('No new commits available')
      updateGitCommitStatus(false)
      lastNotifiedGitCommitHash = null // Reset khi đã pull
      return {
        status: 'no-change',
        data: {
          behind,
          ahead,
        },
      }
    }
  } catch (error) {
    l.error('Error checking for Git updates:', error)
    updateGitCommitStatus(false)
    return {
      status: 'error',
      message: `Error checking for Git updates: ${formatGitError(error)}`,
    }
  }
}
