/** Build optional SQL fragment + params to restrict catalog page scope to specific flows. */
export function catalogScopeFlowSqlClause(flowIds?: string[]): { sql: string; params: string[] } {
  const flowFilter = [...new Set((flowIds ?? []).filter(Boolean))]
  if (flowFilter.length === 0) return { sql: '', params: [] }
  return { sql: ` AND tf.id IN (${flowFilter.map(() => '?').join(', ')})`, params: flowFilter }
}
