import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import l from 'electron-log'
import { formatGitError, getGitInstance } from './utils'

export type InteractiveRebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'

export interface InteractiveRebaseTodoItem {
  hash: string
  shortHash: string
  action: InteractiveRebaseAction
  message: string
  author: string
  date: string
}

export interface InteractiveRebaseCommit {
  hash: string
  shortHash: string
  subject: string
  body: string
  author: string
  date: string
}

export interface InteractiveRebaseResponse {
  status: 'success' | 'error' | 'conflict'
  message?: string
  data?: InteractiveRebaseCommit[]
}

export async function getInteractiveRebaseCommits(baseRef: string, cwd?: string): Promise<InteractiveRebaseResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    const statusResult = await git.status()
    if (!statusResult.isClean()) {
      return {
        status: 'error',
        message: 'Working tree has uncommitted changes. Please commit or stash them before interactive rebase.',
      }
    }

    l.info(`Getting interactive rebase commits from ${baseRef} to HEAD`)

    const fieldSep = '|||SEP|||'
    const rawOutput = await git.raw(['log', `--format=%H${fieldSep}%h${fieldSep}%s${fieldSep}%b${fieldSep}%an${fieldSep}%aI`, `${baseRef}..HEAD`])

    const commits: InteractiveRebaseCommit[] = []
    const lines = rawOutput.trim().split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      const parts = line.split(fieldSep)
      if (parts.length >= 6) {
        const [hash, shortHash, subject, body, author, date] = parts
        commits.push({
          hash: hash.trim(),
          shortHash: shortHash.trim(),
          subject: subject?.trim() || '',
          body: body?.trim() || '',
          author: author?.trim() || '',
          date: date?.trim() || '',
        })
      }
    }

    if (commits.length === 0) {
      return {
        status: 'error',
        message: `No commits found between ${baseRef} and HEAD`,
      }
    }

    return { status: 'success', data: commits }
  } catch (error) {
    l.error('Error getting interactive rebase commits:', error)
    return {
      status: 'error',
      message: formatGitError(error),
    }
  }
}

export async function startInteractiveRebase(baseRef: string, todoItems: InteractiveRebaseTodoItem[], cwd?: string): Promise<InteractiveRebaseResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    const statusResult = await git.status()
    if (!statusResult.isClean()) {
      return {
        status: 'error',
        message: 'Working tree has uncommitted changes. Please commit or stash them before interactive rebase.',
      }
    }

    const pickCount = todoItems.filter(t => t.action === 'pick' || t.action === 'reword').length
    if (pickCount === 0) {
      return { status: 'error', message: 'At least one commit must be kept (pick or reword)' }
    }

    const todoLines = todoItems
      .filter(t => t.action !== 'drop')
      .map(t => {
        const msg = (t.message || '').replace(/\n/g, ' ')
        return `${t.action} ${t.hash}\t${msg}`
      })

    const todoContent = `${todoLines.join('\n')}\n`

    const tmpDir = join(tmpdir(), 'honey-badger')
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true })
    }
    const timestamp = Date.now()
    const todoPath = join(tmpDir, `rebase-todo-${timestamp}`)
    const editorScriptPath = join(tmpDir, `rebase-editor-${timestamp}.js`)
    writeFileSync(todoPath, todoContent, 'utf-8')
    writeFileSync(editorScriptPath, `require('fs').copyFileSync(process.env.HONEY_BADGER_REBASE_TODO, process.argv[2])`, 'utf-8')

    const env = {
      ...process.env,
      HONEY_BADGER_REBASE_TODO: todoPath,
      GIT_SEQUENCE_EDITOR: `node "${editorScriptPath}"`,
    }

    l.info('Starting interactive rebase with todo:', todoContent)

    await (git as { raw: (...args: unknown[]) => Promise<string> }).raw('rebase', '-i', baseRef, { env })

    try {
      rmSync(todoPath, { force: true })
      rmSync(editorScriptPath, { force: true })
    } catch {
      // Ignore cleanup errors
    }

    return { status: 'success', message: 'Interactive rebase completed successfully' }
  } catch (error) {
    l.error('Error during interactive rebase:', error)

    if (error instanceof Error && error.message.includes('CONFLICT')) {
      return {
        status: 'conflict',
        message: `Rebase conflict: ${formatGitError(error)}`,
      }
    }

    return {
      status: 'error',
      message: formatGitError(error),
    }
  }
}
