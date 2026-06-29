import { describe, expect, it } from 'vitest'
import { catalogScopeFlowSqlClause } from './catalogScopeFlowSql'

describe('catalogScopeFlowSqlClause', () => {
  it('returns empty clause when no flow ids', () => {
    expect(catalogScopeFlowSqlClause()).toEqual({ sql: '', params: [] })
    expect(catalogScopeFlowSqlClause([])).toEqual({ sql: '', params: [] })
  })

  it('builds IN clause for unique flow ids', () => {
    const { sql, params } = catalogScopeFlowSqlClause(['f1', 'f2', 'f1'])
    expect(sql).toBe(' AND tf.id IN (?, ?)')
    expect(params).toEqual(['f1', 'f2'])
  })
})
