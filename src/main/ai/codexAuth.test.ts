import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCodexCredentials } from './codexAuth'

const jwt = (expiresIn: number) => `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresIn })).toString('base64url')}.signature`

describe('Codex file authentication', () => {
  let directory: string
  let path: string
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'honey-badger-codex-'))
    path = join(directory, 'auth.json')
    vi.stubEnv('CODEX_HOME', directory)
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    await rm(directory, { recursive: true, force: true })
  })
  const save = (path: string, tokens: Record<string, string>, extra = {}) => writeFile(path, JSON.stringify({ auth_mode: 'chatgpt', tokens, ...extra }))

  it('uses CODEX_HOME, reads current tokens on each call, and never refreshes valid tokens', async () => {
    const token = jwt(3600)
    await save(path, { access_token: token, account_id: 'account-1' })
    await expect(getCodexCredentials('')).resolves.toEqual({ token, accountId: 'account-1' })
    await save(path, { access_token: 'replacement', account_id: 'account-2' })
    await expect(getCodexCredentials('')).resolves.toEqual({ token: 'replacement', accountId: 'account-2' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts older auth files without auth_mode and an explicit path', async () => {
    await writeFile(path, JSON.stringify({ tokens: { access_token: jwt(3600) } }))
    await expect(getCodexCredentials(path)).resolves.toMatchObject({ accountId: '' })
  })

  it.each(['missing', 'malformed', 'api-key', 'no-token'])('reports %s credentials without exposing their contents', async kind => {
    if (kind === 'malformed') await writeFile(path, 'secret invalid json')
    if (kind === 'api-key') await save(path, { access_token: 'secret' }, { auth_mode: 'apikey' })
    if (kind === 'no-token') await save(path, {})
    await expect(getCodexCredentials('')).rejects.toThrow(/codex login/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes once for concurrent requests and preserves unrelated auth fields', async () => {
    const nextToken = jwt(7200)
    await save(path, { access_token: jwt(-60), refresh_token: 'refresh-old', id_token: 'id-old', account_id: 'account-1' }, { custom: 'preserved' })
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ access_token: nextToken, refresh_token: 'refresh-new' })))
    const results = await Promise.all([getCodexCredentials(''), getCodexCredentials('')])
    expect(results).toEqual([
      { token: nextToken, accountId: 'account-1' },
      { token: nextToken, accountId: 'account-1' },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://auth.openai.com/oauth/token')
    const persisted = JSON.parse(await readFile(path, 'utf8'))
    expect(persisted).toMatchObject({ custom: 'preserved', tokens: { access_token: nextToken, refresh_token: 'refresh-new', id_token: 'id-old' } })
    expect(persisted.last_refresh).toEqual(expect.any(String))
  })

  it('keeps a login replaced by Codex during refresh', async () => {
    await save(path, { access_token: jwt(-60), refresh_token: 'refresh-old' })
    const replacement = jwt(8000)
    fetchMock.mockImplementation(async () => {
      await save(path, { access_token: replacement, account_id: 'new-account' })
      return new Response(JSON.stringify({ access_token: jwt(4000) }))
    })
    await expect(getCodexCredentials('')).resolves.toEqual({ token: replacement, accountId: 'new-account' })
    expect(JSON.parse(await readFile(path, 'utf8')).tokens.account_id).toBe('new-account')
  })

  it('requires login for an expired token without a refresh token', async () => {
    await save(path, { access_token: jwt(-60) })
    await expect(getCodexCredentials('')).rejects.toThrow(/codex login/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['null', 'invalid-json', '{}'])('rejects an invalid refresh response (%s) without changing auth', async body => {
    await save(path, { access_token: jwt(-60), refresh_token: 'refresh-old' })
    const before = await readFile(path, 'utf8')
    fetchMock.mockResolvedValue(new Response(body))
    await expect(getCodexCredentials('')).rejects.toThrow('access token hợp lệ')
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('leaves auth intact after a failed refresh and releases the refresh lock', async () => {
    await save(path, { access_token: jwt(-60), refresh_token: 'refresh-secret' })
    const before = await readFile(path, 'utf8')
    fetchMock.mockResolvedValueOnce(new Response('upstream-secret', { status: 401 }))
    await expect(getCodexCredentials('')).rejects.toThrow('HTTP 401')
    expect(await readFile(path, 'utf8')).toBe(before)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: jwt(4000) })))
    await expect(getCodexCredentials('')).resolves.toMatchObject({ accountId: '' })
  })
})
