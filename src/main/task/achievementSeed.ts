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
        def.is_repeatable,
        def.condition_type,
        def.condition_threshold ?? null,
        def.is_negative,
        def.sort_order,
      ])
      await query(
        `INSERT INTO achievements
          (code, category, tier, name, description, icon, xp_reward, is_repeatable, condition_type, condition_threshold, is_negative, sort_order)
         VALUES ${valuesSql}
         ON CONFLICT (code) DO UPDATE SET
           category = EXCLUDED.category,
           tier = EXCLUDED.tier,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           icon = EXCLUDED.icon,
           xp_reward = EXCLUDED.xp_reward,
           is_repeatable = EXCLUDED.is_repeatable,
           condition_type = EXCLUDED.condition_type,
           condition_threshold = EXCLUDED.condition_threshold,
           is_negative = EXCLUDED.is_negative,
           sort_order = EXCLUDED.sort_order`,
        params
      )
    }
    invalidateAchievementDefsCache()
    seeded = true
  } catch {
    // Bỏ qua: chưa config DB
  }
}
