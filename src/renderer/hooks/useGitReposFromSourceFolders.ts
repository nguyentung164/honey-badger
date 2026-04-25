import { useEffect, useState } from 'react'
import { useSourceFolderStore } from '../stores/useSourceFolderStore'

export interface GitRepoItem {
  path: string
  name: string
}

const MAX_REPOS = 25

/**
 * Load Git repos for tabs in Git dialogs and GitHooksSection.
 * - When selectedProjectId is provided (multi-repo): use getSourceFoldersByProject(selectedProjectId)
 * - When selectedSourceFolder is provided (single-repo): use only that folder
 * - Otherwise: use sourceFolderList from store
 */
export function useGitReposFromSourceFolders(
  open: boolean,
  selectedProjectId?: string | null,
  selectedSourceFolder?: string | null
) {
  const sourceFolderList = useSourceFolderStore(s => s.sourceFolderList)
  const [repos, setRepos] = useState<GitRepoItem[]>([])
  // Khởi tạo loading=true ngay khi open=true để tránh flash "No Git repository found"
  const [loading, setLoading] = useState(open)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setRepos([])
    const load = async () => {
      try {
        let folders: { name?: string | null; path?: string }[] = []
        if (selectedProjectId?.trim()) {
          const res = await window.api.task.getSourceFoldersByProject(selectedProjectId.trim())
          if (cancelled) return
          if (res.status === 'success' && Array.isArray(res.data)) {
            folders = res.data
          }
        } else if (selectedSourceFolder?.trim()) {
          const p = selectedSourceFolder.trim()
          const found = sourceFolderList.find(f => (f.path ?? '').trim() === p)
          folders = found ? [found] : [{ path: p, name: p.split(/[/\\]/).filter(Boolean).pop() ?? p }]
        } else {
          folders = sourceFolderList
        }

        const gitRepos: GitRepoItem[] = []
        const maxCheck = Math.min(folders.length, MAX_REPOS * 2)
        for (let i = 0; i < maxCheck && gitRepos.length < MAX_REPOS; i++) {
          if (cancelled) return
          const folder = folders[i]
          const p = (folder.path ?? '').trim()
          if (!p) continue
          try {
            // Dùng get_branches thay vì detect_version_control vì detect_version_control
            // check SVN trước Git — nếu folder có .svn thì trả về 'svn' dù cũng có .git.
            const br = await window.api.git.get_branches(p)
            if (br.status === 'success' && br.data) {
              gitRepos.push({
                path: p,
                name: folder.name ?? p.split(/[/\\]/).filter(Boolean).pop() ?? p,
              })
            }
          } catch {
            // skip invalid folders
          }
        }
        if (cancelled) return
        setRepos(gitRepos)
      } catch {
        if (!cancelled) setRepos([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open, selectedProjectId, selectedSourceFolder, sourceFolderList])

  return { repos, loading }
}
