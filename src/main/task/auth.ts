import * as bcrypt from 'bcryptjs'
import Store from 'electron-store'
import { getPasswordHash, getUserByUserCodeOrEmail, getUserRoles, isAppAdmin } from './mysqlTaskStore'

const store = new Store()
const _SESSION_KEY = 'taskAuthSessions'
const TOKEN_STORE_KEY = 'taskAuthToken'
const AUTH_STORE_KEY = 'taskAuth'

export interface SessionData {
  userId: string
  userCode: string
  name: string
  role: string
  expiresAt: number
}

export async function verifyPassword(identifier: string, password: string): Promise<SessionData | null> {
  const user = await getUserByUserCodeOrEmail(identifier)
  if (!user) return null
  const hash = await getPasswordHash(user.id)
  if (!hash) return null
  const ok = await bcrypt.compare(password, hash)
  if (!ok) return null
  const roleRows = await getUserRoles(user.id)
  const roles = roleRows.map(r => r.role)
  let role = 'dev'
  const isAdmin = await isAppAdmin(user.id)
  const hasPm = roleRows.some(r => r.role === 'pm')
  if (isAdmin) role = 'admin'
  else if (hasPm) role = 'pm'
  else if (roles.includes('pl')) role = 'pl'
  else if (roles.length > 0) role = roles[0]
  return {
    userId: user.id,
    userCode: user.userCode,
    name: user.name,
    role,
    expiresAt: 0,
  }
}

const sessions = new Map<string, SessionData>()

export function createToken(session: Omit<SessionData, 'expiresAt'>): string {
  const crypto = require('node:crypto')
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000
  const fullSession: SessionData = { ...session, expiresAt }
  sessions.set(token, fullSession)
  saveAuthToStore(token, fullSession)
  return token
}

export function verifyToken(token: string): SessionData | null {
  if (!token || typeof token !== 'string' || !token.trim()) return null
  let session = sessions.get(token)
  if (!session) {
    const auth = getAuthFromStore()
    if (auth && auth.token === token && auth.session.expiresAt > Date.now()) {
      session = auth.session
      sessions.set(token, session)
    }
  }
  if (!session || session.expiresAt < Date.now()) return null
  return session
}

export function removeSession(token: string): void {
  sessions.delete(token)
}

function saveAuthToStore(token: string, session: SessionData): void {
  store.set(AUTH_STORE_KEY, { token, session })
}

function getAuthFromStore(): { token: string; session: SessionData } | undefined {
  const auth = store.get(AUTH_STORE_KEY) as { token: string; session: SessionData } | undefined
  return auth?.token && auth?.session ? auth : undefined
}

export function clearAuthFromStore(): void {
  store.delete(AUTH_STORE_KEY)
  store.delete(TOKEN_STORE_KEY)
}

export function removeSessionsForUserId(userId: string): void {
  const token = getTokenFromStore()
  if (token) {
    const session = sessions.get(token) || getAuthFromStore()?.session
    if (session?.userId === userId) {
      removeSession(token)
      clearAuthFromStore()
    }
  }
  const tokensToDelete: string[] = []
  for (const [t, s] of sessions.entries()) {
    if (s.userId === userId) tokensToDelete.push(t)
  }
  for (const t of tokensToDelete) {
    sessions.delete(t)
  }
}

export function setSession(_token: string, _session: SessionData): void {
  // Sessions stored in memory map
}

export function saveTokenToStore(token: string): void {
  store.set(TOKEN_STORE_KEY, token)
}

export function getTokenFromStore(): string | undefined {
  const auth = getAuthFromStore()
  if (auth) return auth.token
  return store.get(TOKEN_STORE_KEY) as string | undefined
}

export function clearTokenFromStore(): void {
  clearAuthFromStore()
}
