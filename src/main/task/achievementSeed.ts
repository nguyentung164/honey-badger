import { ACHIEVEMENT_DEFINITIONS, type AchievementDefinition } from './achievementDefs'
import { invalidateAchievementDefsCache } from './achievementStore'
import { hasDbConfig, query } from './db'

export type { AchievementDefinition }
export { ACHIEVEMENT_DEFINITIONS }

let seeded = false

const BATCH_SIZE = 15

export async function seedAchievements(): Promise<void> {
  if (seeded) return
  if (!hasDbConfig()) return
  try {
    const defs = ACHIEVEMENT_DEFINITIONS
    const rowPlaceholder = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    for (let i = 0; i < defs.length; i += BATCH_SIZE) {
      const batch = defs.slice(i, i + BATCH_SIZE)
      const valuesSql = batch.map(() => rowPlaceholder).join(', ')
      const params = batch.flatMap((def) => [
        def.code,
        def.category,
        def.tier,
        def.name,
        def.description,
        def.icon,
        def.xp_reward,
        def.is_repeatable ? 1 : 0,
        def.condition_type,
        def.condition_threshold ?? null,
        def.is_negative ? 1 : 0,
        def.sort_order,
      ])
      await query(
        `INSERT INTO achievements
          (code, category, tier, name, description, icon, xp_reward, is_repeatable, condition_type, condition_threshold, is_negative, sort_order)
         VALUES ${valuesSql}
         ON DUPLICATE KEY UPDATE
           category = VALUES(category),
           tier = VALUES(tier),
           name = VALUES(name),
           description = VALUES(description),
           icon = VALUES(icon),
           xp_reward = VALUES(xp_reward),
           is_repeatable = VALUES(is_repeatable),
           condition_type = VALUES(condition_type),
           condition_threshold = VALUES(condition_threshold),
           is_negative = VALUES(is_negative),
           sort_order = VALUES(sort_order)`,
        params
      )
    }
    invalidateAchievementDefsCache()
    seeded = true
  } catch {
    // Bỏ qua: chưa config DB
  }
}
