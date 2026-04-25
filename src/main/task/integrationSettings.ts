import l from 'electron-log'
import mailServerStore from '../store/MailServerStore'
import configurationStore from '../store/ConfigurationStore'
import { notifyConfigurationChangedAndRestartWatcher } from '../ipc/settings'
import { hasDbConfig, query, withTransaction } from './db'

export type IntegrationSettingsPayload = {
  mail: { smtpServer: string; port: string; email: string; password: string }
  onedrive: { clientId: string; clientSecret: string; refreshToken: string }
  db: { host: string; port: string; user: string; password: string; databaseName: string }
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

export function normalizeIntegrationPayload(p: IntegrationSettingsPayload): IntegrationSettingsPayload {
  const m = p.mail
  const o = p.onedrive
  const t = p.db
  return {
    mail: {
      smtpServer: str(m?.smtpServer),
      port: str(m?.port),
      email: str(m?.email),
      password: str(m?.password),
    },
    onedrive: {
      clientId: str(o?.clientId),
      clientSecret: str(o?.clientSecret),
      refreshToken: str(o?.refreshToken),
    },
    db: {
      host: str(t?.host),
      port: str(t?.port),
      user: str(t?.user),
      password: str(t?.password),
      databaseName: str(t?.databaseName),
    },
  }
}

function localPayloadFromStores(): IntegrationSettingsPayload {
  const m = mailServerStore.store
  const c = configurationStore.store
  return {
    mail: {
      smtpServer: str(m.smtpServer),
      port: str(m.port),
      email: str(m.email),
      password: str(m.password),
    },
    onedrive: {
      clientId: str(c.oneDriveClientId),
      clientSecret: str(c.oneDriveClientSecret),
      refreshToken: str(c.oneDriveRefreshToken),
    },
    db: {
      host: str(c.dbHost),
      port: str(c.dbPort),
      user: str(c.dbUser),
      password: str(c.dbPassword),
      databaseName: str(c.dbName),
    },
  }
}

export function applyIntegrationPayloadToLocalStores(payload: IntegrationSettingsPayload): void {
  mailServerStore.set({
    smtpServer: payload.mail.smtpServer,
    port: payload.mail.port,
    email: payload.mail.email,
    password: payload.mail.password,
  })
  configurationStore.set({
    ...configurationStore.store,
    oneDriveClientId: payload.onedrive.clientId,
    oneDriveClientSecret: payload.onedrive.clientSecret,
    oneDriveRefreshToken: payload.onedrive.refreshToken,
    dbHost: payload.db.host,
    dbPort: payload.db.port,
    dbUser: payload.db.user,
    dbPassword: payload.db.password,
    dbName: payload.db.databaseName,
  })
}

/** Đọc từ DB; thiếu row thì fallback local (migration). */
export async function getIntegrationSettingsMergedForForm(): Promise<IntegrationSettingsPayload> {
  const local = localPayloadFromStores()
  if (!hasDbConfig()) return local
  try {
    const mailRows = await query<
      { smtp_server: string; port: string; email: string; password: string | Buffer | null }[]
    >('SELECT smtp_server, port, email, password FROM integration_mail_settings WHERE id = 1 LIMIT 1')
    const odRows = await query<
      { client_id: string; client_secret: string; refresh_token: string | Buffer | null }[]
    >('SELECT client_id, client_secret, refresh_token FROM integration_onedrive_settings WHERE id = 1 LIMIT 1')
    const dbRows = await query<
      { host: string; port: string; db_user: string; password: string | Buffer | null; database_name: string }[]
    >('SELECT host, port, db_user, password, database_name FROM integration_task_database_settings WHERE id = 1 LIMIT 1')

    const mail = mailRows?.[0]
    const od = odRows?.[0]
    const td = dbRows?.[0]

    return {
      mail: mail
        ? {
            smtpServer: str(mail.smtp_server),
            port: str(mail.port),
            email: str(mail.email),
            password: str(mail.password),
          }
        : local.mail,
      onedrive: od
        ? {
            clientId: str(od.client_id),
            clientSecret: str(od.client_secret),
            refreshToken: str(od.refresh_token),
          }
        : local.onedrive,
      db: td
        ? {
            host: str(td.host),
            port: str(td.port),
            user: str(td.db_user),
            password: str(td.password),
            databaseName: str(td.database_name),
          }
        : local.db,
    }
  } catch (e) {
    l.warn('getIntegrationSettingsMergedForForm failed:', e)
    return local
  }
}

/**
 * Đọc snapshot từ DB (không merge local). Dùng để biết row có tồn tại không.
 */
async function readIntegrationSettingsRawFromDb(): Promise<{
  mail: IntegrationSettingsPayload['mail'] | null
  onedrive: IntegrationSettingsPayload['onedrive'] | null
  db: IntegrationSettingsPayload['db'] | null
}> {
  const empty = { mail: null as IntegrationSettingsPayload['mail'] | null, onedrive: null, db: null }
  if (!hasDbConfig()) return empty
  const mailRows = await query<
    { smtp_server: string; port: string; email: string; password: string | Buffer | null }[]
  >('SELECT smtp_server, port, email, password FROM integration_mail_settings WHERE id = 1 LIMIT 1')
  const odRows = await query<{ client_id: string; client_secret: string; refresh_token: string | Buffer | null }[]>(
    'SELECT client_id, client_secret, refresh_token FROM integration_onedrive_settings WHERE id = 1 LIMIT 1'
  )
  const dbRows = await query<
    { host: string; port: string; db_user: string; password: string | Buffer | null; database_name: string }[]
  >('SELECT host, port, db_user, password, database_name FROM integration_task_database_settings WHERE id = 1 LIMIT 1')

  const mail = mailRows?.[0]
  const od = odRows?.[0]
  const td = dbRows?.[0]

  return {
    mail: mail
      ? {
          smtpServer: str(mail.smtp_server),
          port: str(mail.port),
          email: str(mail.email),
          password: str(mail.password),
        }
      : null,
    onedrive: od
      ? {
          clientId: str(od.client_id),
          clientSecret: str(od.client_secret),
          refreshToken: str(od.refresh_token),
        }
      : null,
    db: td
      ? {
          host: str(td.host),
          port: str(td.port),
          user: str(td.db_user),
          password: str(td.password),
          databaseName: str(td.database_name),
        }
      : null,
  }
}

/**
 * Ghi đè local theo từng phần đã có row trên server (kể cả giá trị rỗng).
 */
export async function pullIntegrationSettingsFromDbToLocalStores(): Promise<{ applied: boolean }> {
  if (!hasDbConfig()) return { applied: false }
  try {
    const raw = await readIntegrationSettingsRawFromDb()
    if (raw.mail === null && raw.onedrive === null && raw.db === null) return { applied: false }

    const local = localPayloadFromStores()
    const next: IntegrationSettingsPayload = {
      mail: raw.mail !== null ? raw.mail : local.mail,
      onedrive: raw.onedrive !== null ? raw.onedrive : local.onedrive,
      db: raw.db !== null ? raw.db : local.db,
    }
    applyIntegrationPayloadToLocalStores(next)
    notifyConfigurationChangedAndRestartWatcher()
    return { applied: true }
  } catch (e) {
    l.warn('pullIntegrationSettingsFromDbToLocalStores failed:', e)
    return { applied: false }
  }
}

export async function saveIntegrationSettingsFromAdmin(
  _adminUserId: string,
  payload: IntegrationSettingsPayload
): Promise<void> {
  if (!hasDbConfig()) {
    throw new Error('Task database not configured')
  }
  const normalized = normalizeIntegrationPayload(payload)
  const m = normalized.mail
  const o = normalized.onedrive
  const t = normalized.db

  // updated_by = NULL: tránh lỗi FK tới users khi schema có FK nhưng dữ liệu lệch; cột vẫn audit được sau nếu cần.
  const updatedBy: string | null = null

  await withTransaction(async tx => {
    await tx(
      `INSERT INTO integration_mail_settings (id, smtp_server, port, email, password, updated_by)
       VALUES (1, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE smtp_server = VALUES(smtp_server), port = VALUES(port), email = VALUES(email),
         password = VALUES(password), updated_by = VALUES(updated_by)`,
      [m.smtpServer, m.port, m.email, m.password, updatedBy]
    )
    await tx(
      `INSERT INTO integration_onedrive_settings (id, client_id, client_secret, refresh_token, updated_by)
       VALUES (1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE client_id = VALUES(client_id), client_secret = VALUES(client_secret),
         refresh_token = VALUES(refresh_token), updated_by = VALUES(updated_by)`,
      [o.clientId, o.clientSecret, o.refreshToken, updatedBy]
    )
    await tx(
      `INSERT INTO integration_task_database_settings (id, host, port, db_user, password, database_name, updated_by)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE host = VALUES(host), port = VALUES(port), db_user = VALUES(db_user),
         password = VALUES(password), database_name = VALUES(database_name), updated_by = VALUES(updated_by)`,
      [t.host, t.port, t.user, t.password, t.databaseName, updatedBy]
    )
  })

  applyIntegrationPayloadToLocalStores(normalized)
  notifyConfigurationChangedAndRestartWatcher()
}
