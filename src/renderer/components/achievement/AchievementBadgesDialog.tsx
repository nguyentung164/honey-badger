'use client'

import { Lock, Star, Unlock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type AchievementDef, useAchievementStore } from '@/stores/useAchievementStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import { BadgeCard, BadgeWithProgress } from './BadgeCard'

interface AchievementBadgesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Khi set, xem badge của user khác (Admin) */
  userId?: string
  userName?: string
}

export function AchievementBadgesDialog({ open, onOpenChange, userId: viewingUserId, userName: viewingUserName }: AchievementBadgesDialogProps) {
  const { t } = useTranslation()
  const user = useTaskAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'
  const [showLockIcon, setShowLockIcon] = useState(true)
  const { stats, definitions, earned, loading, rarities, fetchAll, fetchRarities, fetchAchievementBundleForUser, getEarnedWithDef } = useAchievementStore()

  const isViewingOther = Boolean(viewingUserId)
  const displayName = isViewingOther ? (viewingUserName ?? '—') : (user?.name ?? '—')

  const earnedWithDef = getEarnedWithDef()
  const positiveEarned = earnedWithDef.filter(e => !e.def.is_negative)
  const negativeEarned = earnedWithDef.filter(e => e.def.is_negative)
  const lockedDefs = definitions.filter(d => !d.is_negative && !earned.find(e => e.achievement_code === d.code))
  const negativeDefs = definitions.filter(d => d.is_negative).sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))

  const CATEGORY_LABELS: Record<string, string> = {
    task: 'Task',
    git: 'Git',
    review: 'Review',
    report: 'Report',
    quality: 'Quality',
    streak: 'Streak',
  }
  const CATEGORY_ORDER = ['task', 'git', 'review', 'report', 'quality', 'streak']
  const lockedByCategory = CATEGORY_ORDER.reduce<Record<string, AchievementDef[]>>((acc, cat) => {
    const items = lockedDefs.filter(d => d.category === cat)
    if (items.length > 0) acc[cat] = items.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    return acc
  }, {})

  useEffect(() => {
    if (open) {
      fetchRarities()
    }
  }, [open, fetchRarities])

  const handleOpen = (open: boolean) => {
    if (open) {
      if (viewingUserId) {
        void fetchAchievementBundleForUser(viewingUserId)
      } else {
        fetchAll()
      }
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl! max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="pl-6 pr-12 pt-3 pb-3 border-b">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-base shrink-0">
              {isViewingOther ? `${displayName}'s Badges` : 'My Badges'}
            </DialogTitle>
            {isAdmin && (
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  id="achievement-show-lock"
                  checked={showLockIcon}
                  onCheckedChange={setShowLockIcon}
                  size="sm"
                />
                <Label htmlFor="achievement-show-lock" className="text-xs font-normal cursor-pointer flex items-center gap-1.5 text-muted-foreground">
                  {showLockIcon ? <Lock size={12} /> : <Unlock size={12} />}
                  {showLockIcon ? t('achievement.showLock', 'Hiện ổ khóa') : t('achievement.showUnlock', 'Hiện icon')}
                </Label>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="all" className="px-6 py-4">
            <TabsList className="h-7 text-xs">
              <TabsTrigger value="all" className="text-xs h-6 gap-1">
                <Star size={11} />
                All Badges
                <Badge variant="secondary" className="h-4 text-[9px] px-1">
                  {positiveEarned.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="locked" className="text-xs h-6 gap-1">
                Chưa đạt
                {lockedDefs.length > 0 && (
                  <Badge variant="secondary" className="h-4 text-[9px] px-1">
                    {lockedDefs.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="struggle" className="text-xs h-6 gap-1">
                Struggle
                {negativeEarned.length > 0 && (
                  <Badge variant="destructive" className="h-4 text-[9px] px-1">
                    {negativeEarned.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              {loading ? (
                <div className="text-xs text-muted-foreground text-center py-8">Loading...</div>
              ) : positiveEarned.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Đã đạt ({positiveEarned.length})</div>
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 items-start">
                    {positiveEarned.map(e => (
                      <BadgeCard
                        key={e.achievement_code}
                        def={e.def}
                        earned={e}
                        size="sm"
                        showName
                        variant="filled"
                        rarity={rarities[e.achievement_code]}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Star size={32} className="opacity-20" />
                  <p className="text-sm font-medium">Chưa có badge nào</p>
                  <p className="text-xs opacity-70 text-center max-w-[200px]">
                    Bắt đầu commit, hoàn thành task và review code để nhận badge đầu tiên!
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="locked" className="mt-4">
              {loading ? (
                <div className="text-xs text-muted-foreground text-center py-8">Loading...</div>
              ) : lockedDefs.length > 0 ? (
                <div className="space-y-1">
                  {!isAdmin && (
                    <p className="text-xs text-muted-foreground mb-3">Tiến độ của bạn — thanh màu tím cho biết bạn đã đạt bao nhiêu % điều kiện.</p>
                  )}
                  {Object.entries(lockedByCategory).map(([cat, items]) => (
                    <div key={cat} className="mb-4">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">{CATEGORY_LABELS[cat] ?? cat} ({items.length})</div>
                      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 items-start">
                        {items.map((d: AchievementDef) => (
                          <BadgeWithProgress
                            key={d.code}
                            def={d}
                            stats={(stats as unknown as Partial<Record<string, number>>) ?? {}}
                            size="sm"
                            variant="filled"
                            forceUnlocked={isAdmin ? !showLockIcon : false}
                            rarity={rarities[d.code]}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Star size={32} className="opacity-20" />
                  <p className="text-sm font-medium">Bạn đã đạt tất cả badge! 🎉</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="struggle" className="mt-4">
              {loading ? (
                <div className="text-xs text-muted-foreground text-center py-8">Loading...</div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Những badge này phản ánh một số thử thách. Đừng lo, ai cũng có thể gặp!</p>
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 items-start">
                    {negativeDefs.map(def => {
                      const earnedItem = earnedWithDef.find(e => e.achievement_code === def.code)
                      return (
                        <BadgeCard
                          key={def.code}
                          def={def}
                          earned={earnedItem ?? undefined}
                          size="sm"
                          showName
                          variant="filled"
                          forceUnlocked={isAdmin ? !showLockIcon : false}
                          rarity={rarities[def.code]}
                        />
                      )
                    })}
                  </div>
                  {negativeDefs.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">No struggle badges defined.</p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
