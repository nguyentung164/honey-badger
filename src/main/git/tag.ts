import l from 'electron-log'
import { formatGitError, getGitInstance } from './utils'

interface GitTagResponse {
  status: 'success' | 'error'
  message?: string
  data?: any
}

export async function createTag(tagName: string, message?: string, commitHash?: string, cwd?: string): Promise<GitTagResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Creating tag: ${tagName}`)

    const tagOptions = message ? ['-a', tagName, '-m', message] : [tagName]
    if (commitHash) {
      tagOptions.push(commitHash)
    }

    await git.tag(tagOptions)

    l.info('Tag created successfully')

    return {
      status: 'success',
      message: 'Tag created successfully',
    }
  } catch (error) {
    l.error('Error creating tag:', error)
    return {
      status: 'error',
      message: `Error creating tag: ${formatGitError(error)}`,
    }
  }
}

export async function listTags(cwd?: string): Promise<GitTagResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info('Fetching tags')

    const tagsResult = await git.tags()

    l.info('Tags fetched successfully')

    return {
      status: 'success',
      data: tagsResult.all,
    }
  } catch (error) {
    l.error('Error fetching tags:', error)
    return {
      status: 'error',
      message: `Error fetching tags: ${formatGitError(error)}`,
    }
  }
}

export async function listRemoteTags(remote: string = 'origin', cwd?: string): Promise<GitTagResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    const validRemote = typeof remote === 'string' && remote.length > 0 && remote !== '0' ? remote : 'origin'
    l.info(`Fetching remote tags from ${validRemote}`)

    const output = await git.raw(['ls-remote', '--tags', validRemote])
    const tags: string[] = []
    const seen = new Set<string>()
    for (const line of output.trim().split('\n')) {
      if (!line.trim()) continue
      const ref = line.split(/\s+/)[1]
      if (!ref?.startsWith('refs/tags/') || ref.endsWith('^{}')) continue
      const tagName = ref.replace(/^refs\/tags\//, '').replace(/\^{}$/, '')
      if (tagName && !seen.has(tagName)) {
        seen.add(tagName)
        tags.push(tagName)
      }
    }

    l.info(`Remote tags fetched: ${tags.length}`)

    return {
      status: 'success',
      data: tags,
    }
  } catch (error) {
    l.error('Error fetching remote tags:', error)
    return {
      status: 'error',
      message: `Error fetching remote tags: ${formatGitError(error)}`,
    }
  }
}

export async function deleteTag(tagName: string, remote?: string, cwd?: string): Promise<GitTagResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Deleting tag: ${tagName}`)

    // Delete local tag
    await git.tag(['-d', tagName])

    // Delete remote tag if specified
    if (remote) {
      await git.push(remote, `:refs/tags/${tagName}`)
    }

    l.info('Tag deleted successfully')

    return {
      status: 'success',
      message: 'Tag deleted successfully',
    }
  } catch (error) {
    l.error('Error deleting tag:', error)
    return {
      status: 'error',
      message: `Error deleting tag: ${formatGitError(error)}`,
    }
  }
}

export async function pushTag(tagName: string, remote: string = 'origin', cwd?: string): Promise<GitTagResponse> {
  try {
    const git = await getGitInstance(cwd)
    if (!git) {
      return { status: 'error', message: 'Not a git repository or error initializing git' }
    }

    l.info(`Pushing tag: ${tagName} to ${remote}`)

    // Push tag using refs/tags/ format
    await git.push(remote, `refs/tags/${tagName}`)

    l.info('Tag pushed successfully')

    return {
      status: 'success',
      message: 'Tag pushed successfully',
    }
  } catch (error) {
    l.error('Error pushing tag:', error)
    return {
      status: 'error',
      message: `Error pushing tag: ${formatGitError(error)}`,
    }
  }
}
