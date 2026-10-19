import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

interface CodexAuth {
  auth_mode?: string
  tokens: { access_token: string; refresh_token?: string; id_token?: string; account_id?: string }
  last_refresh?: string
}

const refreshLocks = new Map<string, Promise<{ token: string; accountId: string }>>()

function resolveAuthPath(customPath: string): string {
  const value = customPath.trim()
  if (value.startsWith('~/') || value.startsWith('~\\')) return resolve(homedir(), value.slice(2))
  if (value) {
    if (!isAbsolute(value)) throw new Error('Đường dẫn auth.json phải là đường dẫn tuyệt đối.')
    return resolve(value)
  }
  return resolve(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json')
}

async function readAuth(path: string): Promise<CodexAuth> {
  let doc: CodexAuth
  try {
    doc = JSON.parse(await readFile(path, 'utf8')) as CodexAuth
  } catch {
    throw new Error('Không đọc được auth.json của Codex. Kiểm tra đường dẫn và chạy `codex login`.')
  }
  if (!doc || (doc.auth_mode && doc.auth_mode !== 'chatgpt') || typeof doc.tokens?.access_token !== 'string' || !doc.tokens.access_token) {
    throw new Error('Codex chưa đăng nhập bằng ChatGPT. Hãy chạy `codex login`.')
  }
  return doc
}

function expiresSoon(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { exp?: number }
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now() + 30_000
  } catch {
    return false
  }
}

/** Serialize refreshes per auth file; reread on every request to honor Codex login/logout. */
export async function getCodexCredentials(customPath: string): Promise<{ token: string; accountId: string }> {
  const path = resolveAuthPath(customPath)
  const pending = refreshLocks.get(path)
  if (pending) return pending
  const run = async () => {
    const doc = await readAuth(path)
    const tokens = doc.tokens
    if (expiresSoon(tokens.access_token)) {
      if (!tokens.refresh_token) throw new Error('Phiên Codex đã hết hạn. Hãy chạy `codex login` rồi thử lại.')
      let response: Response
      try {
        response = await fetch('https://auth.openai.com/oauth/token', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ client_id: 'app_EMoamEEZ73f0CkXaXp7hrann', grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
        })
      } catch {
        throw new Error('Không thể làm mới phiên Codex. Kiểm tra kết nối mạng rồi thử lại.')
      }
      if (!response.ok) throw new Error(`Không thể làm mới phiên Codex (HTTP ${response.status}). Hãy chạy codex login.`)
      const refreshed = (await response.json().catch(() => null)) as { access_token?: string; refresh_token?: string; id_token?: string } | null
      if (!refreshed || typeof refreshed.access_token !== 'string' || !refreshed.access_token) throw new Error('Codex không trả về access token hợp lệ. Hãy chạy `codex login`.')
      // A separate Codex process may have renewed or replaced the login while we waited.
      const latest = await readAuth(path)
      if (latest.tokens.access_token !== tokens.access_token) {
        if (expiresSoon(latest.tokens.access_token)) throw new Error('Phiên Codex vừa thay đổi. Hãy thử lại.')
        return { token: latest.tokens.access_token, accountId: latest.tokens.account_id ?? '' }
      }
      latest.tokens = {
        ...latest.tokens,
        access_token: refreshed.access_token,
        ...(typeof refreshed.refresh_token === 'string' && refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
        ...(typeof refreshed.id_token === 'string' && refreshed.id_token ? { id_token: refreshed.id_token } : {}),
      }
      latest.last_refresh = new Date().toISOString()
      const temporaryPath = `${path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporaryPath, `${JSON.stringify(latest, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
        await rename(temporaryPath, path)
      } catch {
        throw new Error('Không lưu được phiên Codex đã làm mới. Kiểm tra quyền ghi auth.json rồi đăng nhập lại.')
      } finally {
        await rm(temporaryPath, { force: true }).catch(() => undefined)
      }
      return { token: latest.tokens.access_token, accountId: latest.tokens.account_id ?? '' }
    }
    return { token: tokens.access_token, accountId: tokens.account_id ?? '' }
  }
  const promise = run()
  refreshLocks.set(path, promise)
  try {
    return await promise
  } finally {
    refreshLocks.delete(path)
  }
}
