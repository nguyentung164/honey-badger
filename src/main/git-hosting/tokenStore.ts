import { safeStorage } from 'electron'
import Store from 'electron-store'
import l from 'electron-log'

type Schema = {
  /** Buffer m\u00e3 h\u00f3a base64. N\u1ebfu safeStorage kh\u00f4ng kh\u1ea3 d\u1ee5ng, fallback plaintext v\u1edbi c\u1edd isEncrypted=false. */
  githubToken?: string
  isEncrypted?: boolean
}

const store = new Store<Schema>({
  name: 'git-hosting-tokens',
  defaults: {},
})

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function setGithubToken(token: string): { success: boolean; error?: string } {
  const trimmed = (token || '').trim()
  if (!trimmed) {
    store.delete('githubToken')
    store.delete('isEncrypted')
    return { success: true }
  }
  try {
    if (canEncrypt()) {
      const buf = safeStorage.encryptString(trimmed)
      store.set('githubToken', buf.toString('base64'))
      store.set('isEncrypted', true)
    } else {
      l.warn('safeStorage kh\u00f4ng kh\u1ea3 d\u1ee5ng; l\u01b0u token d\u1ea1ng plaintext trong user data.')
      store.set('githubToken', trimmed)
      store.set('isEncrypted', false)
    }
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    l.error('Failed to save GitHub token:', msg)
    return { success: false, error: msg }
  }
}

export function getGithubToken(): string | undefined {
  const raw = store.get('githubToken') as string | undefined
  if (!raw) return undefined
  const isEncrypted = store.get('isEncrypted') as boolean | undefined
  if (!isEncrypted) return raw
  try {
    const buf = Buffer.from(raw, 'base64')
    return safeStorage.decryptString(buf)
  } catch (err) {
    l.error('Failed to decrypt GitHub token:', err)
    return undefined
  }
}

export function hasGithubToken(): boolean {
  const t = getGithubToken()
  return !!(t && t.trim())
}

export function removeGithubToken(): void {
  store.delete('githubToken')
  store.delete('isEncrypted')
}
