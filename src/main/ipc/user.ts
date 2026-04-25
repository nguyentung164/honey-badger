import { randomBytes } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import * as bcrypt from 'bcryptjs'
import type { IpcMainInvokeEvent } from 'electron'
import { dialog, ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { sendWelcomeEmail } from '../notification/sendMail'
import { onFirstLogin } from '../task/achievementService'
import { clearTokenFromStore, createToken, getTokenFromStore, removeSession, removeSessionsForUserId, type SessionData, verifyPassword, verifyToken } from '../task/auth'
import type { CreateUserInput } from '../task/mysqlTaskStore'
import {
  canUserManageProjectRole,
  createUser,
  deleteUser,
  getPasswordHash,
  getUserAvatarUrl,
  getUserRoles,
  getUsers,
  removeUserProjectRole,
  setPasswordHash,
  setUserProjectRole,
  updateUser,
  updateUserAvatar,
} from '../task/mysqlTaskStore'

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024 // 2MB
const MAX_AVATAR_DIMENSION = 512

function validateAvatarFilePath(sourceFilePath: string): { ok: true } | { ok: false; message: string } {
  const ext = path.extname(sourceFilePath).toLowerCase()
  if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
    return { ok: false, message: 'Please select a JPG or PNG image (max 2MB)' }
  }
  return { ok: true }
}

async function validateAvatarFilePathWithSize(sourceFilePath: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const v = validateAvatarFilePath(sourceFilePath)
  if (!v.ok) return v
  try {
    const fileStat = await stat(sourceFilePath)
    if (fileStat.size > MAX_AVATAR_SIZE_BYTES) {
      return { ok: false, message: 'Please select a JPG or PNG image (max 2MB)' }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: 'Could not read file' }
  }
}

function parseAvatarDataUrlBase64(source: string): { ok: true; buffer: Buffer } | { ok: false; message: string } {
  const m = source.match(/^data:image\/(png|jpeg|jpg);base64,([\s\S]+)$/i)
  if (!m) return { ok: false, message: 'Invalid image data' }
  try {
    const buffer = Buffer.from(m[2], 'base64')
    if (buffer.length > MAX_AVATAR_SIZE_BYTES) {
      return { ok: false, message: 'Image too large (max 2MB)' }
    }
    return { ok: true, buffer }
  } catch {
    return { ok: false, message: 'Invalid image data' }
  }
}

function withAuthFromStore<T extends unknown[]>(handler: (event: IpcMainInvokeEvent, session: SessionData, ...args: T) => Promise<unknown>) {
  return async (event: IpcMainInvokeEvent, ...args: T) => {
    const token = getTokenFromStore()
    const session = token ? verifyToken(token) : null
    if (!session) {
      return { status: 'error' as const, code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    }
    return handler(event, session, ...args)
  }
}

export function registerUserIpcHandlers() {
  l.info('Registering User IPC Handlers...')

  ipcMain.handle(IPC.USER.LOGIN, async (_event, userCode: string, password: string) => {
    try {
      const sessionData = await verifyPassword(userCode, password)
      if (!sessionData) {
        return { status: 'error' as const, message: 'Invalid user code, email or password' }
      }
      const token = createToken(sessionData)
      onFirstLogin(sessionData.userId).catch(() => {})
      let avatarUrl: string | null = null
      try {
        avatarUrl = await getUserAvatarUrl(sessionData.userId)
      } catch {
        avatarUrl = null
      }
      return {
        status: 'success' as const,
        data: {
          token,
          user: {
            id: sessionData.userId,
            userCode: sessionData.userCode,
            name: sessionData.name,
            role: sessionData.role,
            avatarUrl,
          },
        },
      }
    } catch (error: any) {
      l.error('user:login error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.USER.LOGOUT, async () => {
    const token = getTokenFromStore()
    if (token) removeSession(token)
    clearTokenFromStore()
    return { status: 'success' as const }
  })

  ipcMain.handle(IPC.USER.VERIFY, async (_event, token: string) => {
    const session = verifyToken(token)
    if (!session) return { status: 'success' as const, data: null }
    return {
      status: 'success' as const,
      data: {
        id: session.userId,
        userCode: session.userCode,
        name: session.name,
        role: session.role,
      },
    }
  })

  ipcMain.handle(IPC.USER.GET_CURRENT_USER, async () => {
    const token = getTokenFromStore()
    if (!token) return { status: 'success' as const, data: null }
    const session = verifyToken(token)
    if (!session) {
      clearTokenFromStore()
      return { status: 'success' as const, data: null }
    }
    let avatarUrl: string | null = null
    try {
      avatarUrl = await getUserAvatarUrl(session.userId)
    } catch {
      avatarUrl = null
    }
    return {
      status: 'success' as const,
      data: {
        token,
        user: {
          id: session.userId,
          userCode: session.userCode,
          name: session.name,
          role: session.role,
          avatarUrl,
        },
      },
    }
  })

  ipcMain.handle(IPC.USER.CHANGE_PASSWORD, async (_event, token: string, oldPassword: string, newPassword: string) => {
    try {
      const session = verifyToken(token)
      if (!session) return { status: 'error' as const, code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
      if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
        return { status: 'error' as const, message: 'New password cannot be empty' }
      }
      const hash = await getPasswordHash(session.userId)
      if (!hash) return { status: 'error' as const, message: 'No password set for this user' }
      const ok = await bcrypt.compare(oldPassword, hash)
      if (!ok) return { status: 'error' as const, message: 'Current password is incorrect' }
      const newHash = await bcrypt.hash(newPassword, 10)
      await setPasswordHash(session.userId, newHash)
      return { status: 'success' as const }
    } catch (error: any) {
      l.error('user:change-password error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.USER.SET_USER_PASSWORD, async (_event, token: string, userId: string, newPassword: string) => {
    try {
      const session = verifyToken(token)
      if (!session) return { status: 'error' as const, code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
      if (session.role !== 'admin') {
        return { status: 'error' as const, code: 'FORBIDDEN', message: 'Admin role required' }
      }
      if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
        return { status: 'error' as const, message: 'Password cannot be empty' }
      }
      const newHash = await bcrypt.hash(newPassword, 10)
      await setPasswordHash(userId, newHash)
      removeSessionsForUserId(userId)
      return { status: 'success' as const }
    } catch (error: any) {
      l.error('user:set-user-password error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(
    IPC.USER.GET_USER_ROLES,
    withAuthFromStore(async (_event, session, userId: string) => {
      if (session.role !== 'admin') {
        return { status: 'error' as const, code: 'FORBIDDEN', message: 'Admin role required' }
      }
      try {
        const roles = await getUserRoles(userId)
        return { status: 'success' as const, data: roles }
      } catch (error: any) {
        l.error('user:get-user-roles error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(IPC.USER.SET_USER_PROJECT_ROLE, async (_event, token: string, userId: string, projectId: string | null, role: 'dev' | 'pl' | 'pm') => {
    try {
      const session = verifyToken(token)
      if (!session) return { status: 'error' as const, code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
      if (projectId) {
        const canManage = await canUserManageProjectRole(session.userId, projectId, role)
        if (!canManage) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền gán role này' }
      } else {
        if (session.role !== 'admin') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Chỉ admin mới gán role global' }
      }
      await setUserProjectRole(userId, projectId, role)
      return { status: 'success' as const }
    } catch (error: any) {
      l.error('user:set-user-project-role error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.USER.REMOVE_USER_PROJECT_ROLE, async (_event, token: string, userId: string, projectId: string | null, role: 'dev' | 'pl' | 'pm') => {
    try {
      const session = verifyToken(token)
      if (!session) return { status: 'error' as const, code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
      if (projectId) {
        const canManage = await canUserManageProjectRole(session.userId, projectId, role)
        if (!canManage) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền xóa role này' }
      } else {
        if (session.role !== 'admin') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Chỉ admin mới xóa role global' }
      }
      await removeUserProjectRole(userId, projectId, role)
      return { status: 'success' as const }
    } catch (error: any) {
      l.error('user:remove-user-project-role error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(
    IPC.USER.GET_USERS,
    withAuthFromStore(async (_event, _session) => {
      try {
        const users = await getUsers()
        return { status: 'success' as const, data: users }
      } catch (error: any) {
        l.error('user:get-users error:', error)
        if (error?.response?.status === 401 || error?.statusCode === 401) {
          return { status: 'error' as const, code: 'UNAUTHORIZED', message: error.message }
        }
        if (error?.response?.status === 403 || error?.statusCode === 403) {
          return { status: 'error' as const, code: 'FORBIDDEN', message: error.message }
        }
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.USER.CREATE_USER,
    withAuthFromStore(async (_event, session, input: CreateUserInput) => {
      if (session.role !== 'admin') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Chỉ admin mới tạo user' }
      const emailTrimmed = input.email?.trim()
      if (!emailTrimmed) return { status: 'error' as const, message: 'Email là bắt buộc khi đăng ký user' }
      try {
        const user = await createUser(input)
        const plainPassword = randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16)
        const hashedPassword = await bcrypt.hash(plainPassword, 10)
        await setPasswordHash(user.id, hashedPassword)
        sendWelcomeEmail({
          to: emailTrimmed,
          userCode: user.userCode,
          name: user.name,
          email: user.email || emailTrimmed,
          password: plainPassword,
        }).catch(err => l.error('sendWelcomeEmail failed:', err))
        return { status: 'success' as const, data: user }
      } catch (error: any) {
        l.error('user:create-user error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.USER.UPDATE_USER,
    withAuthFromStore(async (_event, session, id: string, data: { userCode?: string; name?: string; email?: string; receiveCommitNotification?: boolean }) => {
      if (session.role !== 'admin') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Chỉ admin mới sửa user' }
      try {
        await updateUser(id, data)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('user:update-user error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.USER.DELETE_USER,
    withAuthFromStore(async (_event, session, id: string) => {
      if (session.role !== 'admin') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Chỉ admin mới xóa user' }
      try {
        await deleteUser(id)
        removeSessionsForUserId(id)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('user:delete-user error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(IPC.USER.SELECT_AVATAR_FILE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return ''
    return result.filePaths[0]
  })

  ipcMain.handle(
    IPC.USER.READ_AVATAR_FILE_AS_DATA_URL,
    withAuthFromStore(async (_event, _session, sourceFilePath: string) => {
      const trimmed = typeof sourceFilePath === 'string' ? sourceFilePath.trim() : ''
      if (!trimmed) return { status: 'error' as const, message: 'No file selected' }
      const v = await validateAvatarFilePathWithSize(trimmed)
      if (!v.ok) return { status: 'error' as const, message: v.message }
      try {
        const buf = await readFile(trimmed)
        const ext = path.extname(trimmed).toLowerCase()
        const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
        const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
        return { status: 'success' as const, data: { dataUrl } }
      } catch (err: unknown) {
        l.error('user:read-avatar-file-as-data-url error:', err)
        const msg = err instanceof Error ? err.message : String(err)
        return { status: 'error' as const, message: msg }
      }
    })
  )

  ipcMain.handle(
    IPC.USER.UPLOAD_AVATAR,
    withAuthFromStore(async (_event, session, source: string) => {
      if (!source || typeof source !== 'string' || !source.trim()) {
        return { status: 'error' as const, message: 'No file selected' }
      }
      try {
        const { default: sharp } = await import('sharp')
        const trimmedPathOrData = source.trim()
        let pipeline: ReturnType<typeof sharp>
        if (trimmedPathOrData.startsWith('data:image/')) {
          const parsed = parseAvatarDataUrlBase64(trimmedPathOrData)
          if (!parsed.ok) return { status: 'error' as const, message: parsed.message }
          pipeline = sharp(parsed.buffer)
        } else {
          const v = await validateAvatarFilePathWithSize(trimmedPathOrData)
          if (!v.ok) return { status: 'error' as const, message: v.message }
          pipeline = sharp(trimmedPathOrData)
        }
        const buffer = await pipeline.resize(MAX_AVATAR_DIMENSION, MAX_AVATAR_DIMENSION, { fit: 'cover' }).png().toBuffer()
        const base64 = buffer.toString('base64')
        await updateUserAvatar(session.userId, base64)
        const avatarUrl = `data:image/png;base64,${base64}`
        return { status: 'success' as const, data: { avatarUrl } }
      } catch (err: unknown) {
        l.error('user:upload-avatar error:', err)
        const msg = err instanceof Error ? err.message : String(err)
        return { status: 'error' as const, message: msg }
      }
    })
  )

  ipcMain.handle(IPC.USER.GET_AVATAR_URL, async (_event, userId: string) => {
    if (!userId || typeof userId !== 'string') return null
    try {
      return await getUserAvatarUrl(userId)
    } catch {
      return null
    }
  })

  l.info('User IPC Handlers registered')
}
