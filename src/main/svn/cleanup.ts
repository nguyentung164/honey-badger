import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { shell } from 'electron'
import l from 'electron-log'
import type { SVNResponse } from 'main/types/types'
import configurationStore from '../store/ConfigurationStore'

const execFileAsync = promisify(execFile)

const SVN_STATUS_MAX_BUFFER = 10 * 1024 * 1024

/**
 * Parse svn status output to get unversioned (?) and ignored (I) paths.
 * SVN format: 7 status columns + 1 blank, then path. Path starts at index 8.
 */
function parseStatusForUnversionedAndIgnored(stdout: string, cwd: string): { unversioned: string[]; ignored: string[] } {
  const unversioned: string[] = []
  const ignored: string[] = []
  const lines = stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  for (const line of lines) {
    if (line.length < 9) continue
    const status = line[0]
    const filePath = line.slice(8).trim()
    if (!filePath) continue
    const absolutePath = path.resolve(cwd, filePath)
    if (status === '?') {
      unversioned.push(absolutePath)
    } else if (status === 'I') {
      ignored.push(absolutePath)
    }
  }
  return { unversioned, ignored }
}

/**
 * Sort paths by depth (deepest first) so we can trash children before parents.
 * Uses / and \ for cross-platform path depth.
 */
function sortByDepthDescending(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const depthA = path.normalize(a).split(/[/\\]/).filter(Boolean).length
    const depthB = path.normalize(b).split(/[/\\]/).filter(Boolean).length
    return depthB - depthA
  })
}

/**
 * Move items to Recycle Bin (TortoiseSVN-style). Trash deepest paths first.
 */
async function moveToTrash(paths: string[]): Promise<void> {
  const sorted = sortByDepthDescending(paths)
  for (const p of sorted) {
    if (!fs.existsSync(p)) continue
    try {
      await shell.trashItem(p)
      l.info(`Trashed: ${p}`)
    } catch (err) {
      l.warn(`Failed to trash ${p}:`, err)
      // Continue with others - don't fail entire cleanup
    }
  }
}

export async function cleanup(options?: string[]): Promise<SVNResponse> {
  const { svnFolder, sourceFolder } = configurationStore.store
  const opts = new Set(options ?? [])

  if (!svnFolder || !fs.existsSync(svnFolder)) {
    return { status: 'error', message: 'Invalid path to svn executable.' }
  }
  if (!sourceFolder || !fs.existsSync(sourceFolder)) {
    return { status: 'error', message: 'Invalid source folder.' }
  }

  const svnExecutable = path.join(svnFolder, 'bin', 'svn.exe')

  try {
    // 1. Core svn cleanup (always) - fixes status, breaks locks
    const args: string[] = ['cleanup']
    if (opts.has('externals')) args.push('--include-externals')
    if (opts.has('unused')) args.push('--vacuum-pristines')

    await execFileAsync(svnExecutable, args, { cwd: sourceFolder })
    l.info(`svn ${args.join(' ')}`)

    // 2. Unversioned / ignored: move to trash (TortoiseSVN-style). Do NOT use --remove-unversioned/--remove-ignored (permanent delete).
    if (opts.has('unversioned') || opts.has('ignored')) {
      const { stdout } = await execFileAsync(svnExecutable, ['status', '--no-ignore'], {
        cwd: sourceFolder,
        maxBuffer: SVN_STATUS_MAX_BUFFER,
      })
      const { unversioned, ignored } = parseStatusForUnversionedAndIgnored(stdout, sourceFolder)
      const toTrash: string[] = []
      if (opts.has('unversioned')) toTrash.push(...unversioned)
      if (opts.has('ignored')) toTrash.push(...ignored)
      await moveToTrash(toTrash)
    }

    return { status: 'success', data: 'Cleanup completed successfully' }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
