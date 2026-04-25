import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { dropAllTablesInTaskDatabase, ensureDatabase, executeSchemaSql, isTaskSchemaApplied } from './db'

function getSchemaPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'task-schema', 'schema.sql')
  }
  return join(process.cwd(), 'src', 'main', 'task', 'schema.sql')
}

/**
 * Init task schema. When packaged: reads from process.resourcesPath/task-schema/schema.sql
 * (electron-builder extraResources copies to task-schema/schema.sql).
 * @returns recreated — true nếu schema đã tồn tại và đã xóa toàn bộ bảng rồi tạo lại
 */
export async function initTaskSchema(): Promise<boolean> {
  await ensureDatabase()
  let recreated = false
  if (await isTaskSchemaApplied()) {
    await dropAllTablesInTaskDatabase()
    recreated = true
  }
  const sql = readFileSync(getSchemaPath(), 'utf-8')
  await executeSchemaSql(sql)
  return recreated
}
