import { create } from 'zustand'

/** Tăng mỗi lần gọi fetch bundle user khác; response cũ bị bỏ qua khi đã chọn user mới. */
let otherUserAchievementFetchSeq = 0

export interface UserStats {
  user_id: string
  xp: number
  current_rank: string
  current_streak_days: number
  current_report_streak_days: number
  last_activity_date: string | null
  total_tasks_done: number
  total_tasks_created: number
  total_commits: number
  total_pushes: number
  total_merges: number
  total_branches_created: number
  total_stashes: number
  total_rebases: number
  total_reviews: number
  total_reports: number
  total_spotbugs_clean: number
  total_spotbugs_fails: number
  total_files_committed: number
  total_insertions: number
  total_coding_rules_created: number
  total_tasks_on_time: number
  total_tasks_early: number
  total_tasks_late: number
  total_tasks_bug_done: number
  total_tasks_feature_done: number
  total_tasks_critical_done: number
  consecutive_no_review_days: number
  consecutive_no_report_days: number
  consecutive_spotbugs_fails: number
  last_negative_check_date?: string | null
}

export interface AchievementDef {
  code: string
  category: string
  tier: 'bronze' | 'silver' | 'gold' | 'special' | 'negative'
  name: string
  description: string
  icon: string
  xp_reward: number
  is_repeatable: boolean
  condition_type: string
  condition_threshold: number | null
  is_negative: boolean
  sort_order: number
}

export interface UserAchievement {
  id: string
  user_id: string
  achievement_code: string
  earned_count: number
  first_earned_at: string
  last_earned_at: string
  is_redeemed: boolean
}

export interface BadgeDisplayItem {
  user_id: string
  achievement_code: string
  display_order: number
}

export interface LeaderboardEntry {
  user_id: string
  name: string
  user_code: string
  xp: number
  current_rank: string
  total_achievements: number
  /** Chuỗi "PM,PL,DEV" từ API — có thể nhiều role. */
  positions?: string | null
}

export interface UserAchievementWithDef extends UserAchievement {
  def: AchievementDef
}

interface AchievementState {
  stats: UserStats | null
  definitions: AchievementDef[]
  earned: UserAchievement[]
  pinned: BadgeDisplayItem[]
  /** Stats/earned/pinned của chính người dùng đang đăng nhập — không bị ghi đè khi admin xem profile người khác. */
  myStats: UserStats | null
  myEarned: UserAchievement[]
  myPinned: BadgeDisplayItem[]
  leaderboard: LeaderboardEntry[]
  loading: boolean
  /** Sau khi `fetchAchievementBundleForUser` hoàn tất (kể cả stats null — user chưa có hàng user_stats). Dùng để tắt loading, không dựa vào stats.user_id. */
  otherUserBundleAppliedForUserId: string | null
  /** % users đã earn mỗi achievement (code → 0-100). Dùng để hiển thị rarity. */
  rarities: Record<string, number>
  totalUsersForRarity: number

  fetchAll: () => Promise<void>
  fetchStats: () => Promise<void>
  fetchBadges: () => Promise<void>
  fetchStatsForUser: (userId: string) => Promise<void>
  fetchBadgesForUser: (userId: string) => Promise<void>
  /** Admin xem profile user: xóa state cũ ngay, fetch stats+badge+defs song song, một lần set — tránh flash user trước và lệch stats/badge. */
  fetchAchievementBundleForUser: (userId: string) => Promise<void>
  fetchLeaderboard: (projectId?: string | null) => Promise<void>
  fetchRarities: () => Promise<void>
  pinBadges: (codes: string[]) => Promise<void>

  getEarnedWithDef: () => UserAchievementWithDef[]
  getPinnedWithDef: () => UserAchievementWithDef[]
  /** Lấy pinned badge của chính người dùng đang đăng nhập (dùng cho TitleBar — không bị ảnh hưởng khi admin xem user khác). */
  getMyPinnedWithDef: () => UserAchievementWithDef[]
  /** Lấy earned achievements của chính người dùng đang đăng nhập (dùng cho notification dialog — không bị ảnh hưởng khi admin xem user khác). */
  getMyEarnedWithDef: () => UserAchievementWithDef[]
}

export const useAchievementStore = create<AchievementState>((set, get) => ({
  stats: null,
  definitions: [],
  earned: [],
  pinned: [],
  myStats: null,
  myEarned: [],
  myPinned: [],
  leaderboard: [],
  loading: false,
  otherUserBundleAppliedForUserId: null,
  rarities: {},
  totalUsersForRarity: 0,

  fetchAll: async () => {
    set({ loading: true, otherUserBundleAppliedForUserId: null })
    try {
      await Promise.all([get().fetchStats(), get().fetchBadges()])
    } finally {
      set({ loading: false })
    }
  },

  fetchStats: async () => {
    try {
      const res = await window.api.achievement.getStats()
      if (res.status === 'success') {
        const s = res.data ?? null
        set({ stats: s, myStats: s })
      }
    } catch {
      // ignore
    }
  },

  fetchBadges: async () => {
    try {
      const [badgesRes, defsRes] = await Promise.all([
        window.api.achievement.getBadges(),
        window.api.achievement.getAllDefinitions(),
      ])
      if (badgesRes.status === 'success' && badgesRes.data) {
        const earned = badgesRes.data.badges ?? []
        const pinned = badgesRes.data.pinned ?? []
        set({ earned, pinned, myEarned: earned, myPinned: pinned })
      }
      if (defsRes.status === 'success') {
        set({ definitions: defsRes.data ?? [] })
      }
    } catch {
      // ignore
    }
  },

  fetchStatsForUser: async (userId: string) => {
    try {
      const res = await window.api.achievement.getStatsForUser(userId)
      if (res.status === 'success') set({ stats: res.data ?? null })
    } catch {
      // ignore
    }
  },

  fetchBadgesForUser: async (userId: string) => {
    try {
      const [badgesRes, defsRes] = await Promise.all([
        window.api.achievement.getBadgesForUser(userId),
        window.api.achievement.getAllDefinitions(),
      ])
      if (badgesRes.status === 'success' && badgesRes.data) {
        set({
          earned: badgesRes.data.badges ?? [],
          pinned: badgesRes.data.pinned ?? [],
        })
      }
      if (defsRes.status === 'success') {
        set({ definitions: defsRes.data ?? [] })
      }
    } catch {
      // ignore
    }
  },

  fetchAchievementBundleForUser: async (userId: string) => {
    const seq = ++otherUserAchievementFetchSeq
    set({ stats: null, earned: [], pinned: [], otherUserBundleAppliedForUserId: null })
    try {
      const [statsRes, badgesRes, defsRes] = await Promise.all([
        window.api.achievement.getStatsForUser(userId),
        window.api.achievement.getBadgesForUser(userId),
        window.api.achievement.getAllDefinitions(),
      ])
      if (seq !== otherUserAchievementFetchSeq) return
      const patch: Partial<AchievementState> = {}
      if (statsRes.status === 'success') patch.stats = statsRes.data ?? null
      if (badgesRes.status === 'success' && badgesRes.data) {
        patch.earned = badgesRes.data.badges ?? []
        patch.pinned = badgesRes.data.pinned ?? []
      }
      if (defsRes.status === 'success') patch.definitions = defsRes.data ?? []
      set({ ...patch, otherUserBundleAppliedForUserId: userId })
    } catch {
      if (seq !== otherUserAchievementFetchSeq) return
      set({ otherUserBundleAppliedForUserId: userId })
    }
  },

  fetchLeaderboard: async (projectId?: string | null) => {
    set({ loading: true })
    try {
      const res = projectId
        ? await window.api.achievement.getLeaderboardByProject(projectId)
        : await window.api.achievement.getLeaderboard()
      if (res.status === 'success') {
        const raw = res.data ?? []
        const data = Array.isArray(raw)
          ? raw.map((r: any) => {
              const positions =
                r?.positions != null && String(r.positions).trim() !== ''
                  ? String(r.positions)
                  : r?.position != null && String(r.position).trim() !== ''
                    ? String(r.position)
                    : null
              return {
                ...r,
                positions,
                xp: Number(r?.xp ?? 0),
                total_achievements: Number(r?.total_achievements ?? 0),
              }
            })
          : []
        set({ leaderboard: data, loading: false })
      } else {
        set({ leaderboard: [], loading: false })
      }
    } catch {
      set({ leaderboard: [], loading: false })
    }
  },

  fetchRarities: async () => {
    try {
      const res = await window.api.achievement.getAchievementRarities()
      if (res.status === 'success' && res.data) {
        set({ rarities: res.data.rarities ?? {}, totalUsersForRarity: res.data.totalUsers ?? 0 })
      }
    } catch {
      // ignore
    }
  },

  pinBadges: async (codes: string[]) => {
    try {
      await window.api.achievement.pinBadge(codes)
      const res = await window.api.achievement.getBadges()
      if (res.status === 'success' && res.data) {
        const pinned = res.data.pinned ?? []
        set({ pinned, myPinned: pinned })
      }
    } catch {
      // ignore
    }
  },

  getEarnedWithDef: () => {
    const { earned, definitions } = get()
    return earned
      .map(e => {
        const def = definitions.find(d => d.code === e.achievement_code)
        if (!def) return null
        return { ...e, def }
      })
      .filter(Boolean) as UserAchievementWithDef[]
  },

  getPinnedWithDef: () => {
    const { pinned, earned, definitions } = get()
    return pinned
      .map(p => {
        const earnedItem = earned.find(e => e.achievement_code === p.achievement_code)
        const def = definitions.find(d => d.code === p.achievement_code)
        if (!def || !earnedItem) return null
        return { ...earnedItem, def }
      })
      .filter(Boolean) as UserAchievementWithDef[]
  },

  getMyPinnedWithDef: () => {
    const { myPinned, myEarned, definitions } = get()
    return myPinned
      .map(p => {
        const earnedItem = myEarned.find(e => e.achievement_code === p.achievement_code)
        const def = definitions.find(d => d.code === p.achievement_code)
        if (!def || !earnedItem) return null
        return { ...earnedItem, def }
      })
      .filter(Boolean) as UserAchievementWithDef[]
  },

  getMyEarnedWithDef: () => {
    const { myEarned, definitions } = get()
    return myEarned
      .map(e => {
        const def = definitions.find(d => d.code === e.achievement_code)
        if (!def) return null
        return { ...e, def }
      })
      .filter(Boolean) as UserAchievementWithDef[]
  },
}))
