import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface VersionControlInfo {
  type: 'svn' | 'git' | 'none'
  isValid: boolean
  path: string
  details?: {
    url?: string
    branch?: string
    revision?: string
    lastChangedRev?: string
    lastChangedDate?: string
    lastChangedAuthor?: string
    commit?: string
    commitAuthor?: string
    hasChanges?: boolean
    status?: string
  }
}

/**
 * Phát hiện version control system trong thư mục
 */
export async function detectVersionControl(folderPath: string): Promise<VersionControlInfo> {
  try {
    // Kiểm tra xem thư mục có tồn tại không
    if (!fs.existsSync(folderPath)) {
      return {
        type: 'none',
        isValid: false,
        path: folderPath,
        details: {
          status: 'Thư mục không tồn tại',
        },
      }
    }

    // Kiểm tra SVN
    const svnPath = path.join(folderPath, '.svn')
    if (fs.existsSync(svnPath)) {
      try {
        // Thử chạy svn info để kiểm tra xem có phải SVN repository hợp lệ không
        const svnInfo = execSync('svn info', { cwd: folderPath, encoding: 'utf8' })
        const urlMatch = svnInfo.match(/URL: (.+)/)
        const revisionMatch = svnInfo.match(/Revision: (.+)/)

        return {
          type: 'svn',
          isValid: true,
          path: folderPath,
          details: {
            url: urlMatch?.[1]?.trim(),
            revision: revisionMatch?.[1]?.trim(),
            status: 'SVN repository hợp lệ',
          },
        }
      } catch (_error) {
        return {
          type: 'svn',
          isValid: false,
          path: folderPath,
          details: {
            status: 'SVN repository không hợp lệ hoặc lỗi kết nối',
          },
        }
      }
    }

    // Kiểm tra Git
    const gitPath = path.join(folderPath, '.git')
    if (fs.existsSync(gitPath)) {
      try {
        // Thử chạy git status để kiểm tra xem có phải Git repository hợp lệ không
        const _gitStatus = execSync('git status --porcelain', { cwd: folderPath, encoding: 'utf8' })
        const gitRemote = execSync('git remote get-url origin', { cwd: folderPath, encoding: 'utf8' }).trim()
        const gitBranch = execSync('git branch --show-current', { cwd: folderPath, encoding: 'utf8' }).trim()

        return {
          type: 'git',
          isValid: true,
          path: folderPath,
          details: {
            url: gitRemote || undefined,
            branch: gitBranch || undefined,
            status: 'Git repository hợp lệ',
          },
        }
      } catch (_error) {
        return {
          type: 'git',
          isValid: false,
          path: folderPath,
          details: {
            status: 'Git repository không hợp lệ hoặc lỗi kết nối',
          },
        }
      }
    }

    // Kiểm tra trong thư mục cha (recursive)
    const parentPath = path.dirname(folderPath)
    if (parentPath !== folderPath) {
      const parentResult = await detectVersionControl(parentPath)
      if (parentResult.type !== 'none') {
        return {
          ...parentResult,
          path: folderPath,
          details: {
            ...parentResult.details,
            status: `Tìm thấy ${parentResult.type.toUpperCase()} repository trong thư mục cha`,
          },
        }
      }
    }

    return {
      type: 'none',
      isValid: false,
      path: folderPath,
      details: {
        status: 'Không tìm thấy version control system',
      },
    }
  } catch (error) {
    return {
      type: 'none',
      isValid: false,
      path: folderPath,
      details: {
        status: `Lỗi khi phát hiện version control: ${error instanceof Error ? error.message : String(error)}`,
      },
    }
  }
}

/**
 * Lấy thông tin chi tiết về version control system
 */
export async function getVersionControlDetails(folderPath: string): Promise<VersionControlInfo> {
  const basicInfo = await detectVersionControl(folderPath)

  if (basicInfo.type === 'svn' && basicInfo.isValid) {
    try {
      const svnInfo = execSync('svn info', { cwd: folderPath, encoding: 'utf8' })
      const urlMatch = svnInfo.match(/URL: (.+)/)
      const revisionMatch = svnInfo.match(/Revision: (.+)/)
      const lastChangedMatch = svnInfo.match(/Last Changed Rev: (.+)/)
      const lastChangedDateMatch = svnInfo.match(/Last Changed Date: (.+)/)
      const lastChangedAuthorMatch = svnInfo.match(/Last Changed Author: (.+)/)

      return {
        ...basicInfo,
        details: {
          url: urlMatch?.[1]?.trim(),
          revision: revisionMatch?.[1]?.trim(),
          lastChangedRev: lastChangedMatch?.[1]?.trim(),
          lastChangedDate: lastChangedDateMatch?.[1]?.trim(),
          lastChangedAuthor: lastChangedAuthorMatch?.[1]?.trim(),
          status: 'SVN repository chi tiết',
        },
      }
    } catch (error) {
      return {
        ...basicInfo,
        details: {
          ...basicInfo.details,
          status: `Lỗi khi lấy thông tin SVN: ${error instanceof Error ? error.message : String(error)}`,
        },
      }
    }
  }

  if (basicInfo.type === 'git' && basicInfo.isValid) {
    try {
      const gitRemote = execSync('git remote get-url origin', { cwd: folderPath, encoding: 'utf8' }).trim()
      const gitBranch = execSync('git branch --show-current', { cwd: folderPath, encoding: 'utf8' }).trim()
      const gitCommit = execSync('git rev-parse HEAD', { cwd: folderPath, encoding: 'utf8' }).trim()
      const gitStatus = execSync('git status --porcelain', { cwd: folderPath, encoding: 'utf8' })
      let commitAuthor: string | undefined
      try {
        commitAuthor = execSync('git log -1 --format="%an <%ae>"', { cwd: folderPath, encoding: 'utf8' }).trim()
      } catch {
        // Bỏ qua nếu không lấy được author (repo mới chưa có commit)
      }

      return {
        ...basicInfo,
        details: {
          url: gitRemote || undefined,
          branch: gitBranch || undefined,
          commit: gitCommit || undefined,
          commitAuthor: commitAuthor || undefined,
          hasChanges: gitStatus.length > 0,
          status: 'Git repository chi tiết',
        },
      }
    } catch (error) {
      return {
        ...basicInfo,
        details: {
          ...basicInfo.details,
          status: `Lỗi khi lấy thông tin Git: ${error instanceof Error ? error.message : String(error)}`,
        },
      }
    }
  }

  return basicInfo
}
