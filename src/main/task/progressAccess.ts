import type { SessionData } from './auth'
import { getUserBasicInfo, getUsersInManagedProjects } from './progressStore'

/** Viewer được xem progress/metrics của targetUserId hay không. */
export async function canSessionViewTargetUser(session: SessionData, targetUserId: string): Promise<boolean> {
  if (!targetUserId || typeof targetUserId !== 'string') return false
  const r = (session.role || '').toLowerCase()
  if (r === 'admin') {
    const u = await getUserBasicInfo(targetUserId)
    return u != null
  }
  if (r === 'pm' || r === 'pl') {
    const allowed = await getUsersInManagedProjects(session.userId)
    return allowed.some(u => u.id === targetUserId)
  }
  return session.userId === targetUserId
}

/** Lọc danh sách user id theo phạm vi viewer (một lần gọi getUsersInManagedProjects cho pm/pl). */
export async function filterUserIdsVisibleToSession(session: SessionData, ids: string[]): Promise<string[]> {
  const clean = [...new Set((ids ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0))]
  if (clean.length === 0) return []
  const r = (session.role || '').toLowerCase()
  if (r === 'admin') return clean
  if (r === 'pm' || r === 'pl') {
    const allowed = await getUsersInManagedProjects(session.userId)
    const set = new Set(allowed.map(u => u.id))
    return clean.filter(id => set.has(id))
  }
  return clean.filter(id => id === session.userId)
}
