'use client'

import { Lock, Star, Unlock } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
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

const CATEGORY_ORDER = ['task', 'git', 'report', 'quality', 'streak']

const GRID_CLASS = 'grid grid-cols-4 sm:grid-cols-5 md:grid-cols-5 gap-3 items-start'

/** Skip paint for off-screen cells — helps long badge grids scroll smoothly. */
function BadgeGridCell({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center [content-visibility:auto] [contain-intrinsic-size:5rem_6.25rem]">
      {children}
    </div>
  )
}

export function AchievementBadgesDialog({ open, onOpenChange, userId: viewingUserId, userName: viewingUserName }: AchievementBadgesDialogProps) {
  const { t } = useTranslation()
  const user = useTaskAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'
  const [showLockIcon, setShowLockIcon] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const { stats, definitions, earned, loading, rarities, fetchAll, fetchRarities, fetchAchievementBundleForUser, getEarnedWithDef } = useAchievementStore()

  const isViewingOther = Boolean(viewingUserId)
  const displayName = isViewingOther ? (viewingUserName ?? '—') : (user?.name ?? '—')

  const earnedWithDef = getEarnedWithDef()
  const positiveEarned = useMemo(() => earnedWithDef.filter(e => !e.def.is_negative), [earnedWithDef])
  const negativeEarned = useMemo(() => earnedWithDef.filter(e => e.def.is_negative), [earnedWithDef])
  const lockedDefs = useMemo(
    () => definitions.filter(d => !d.is_negative && !earned.find(e => e.achievement_code === d.code)),
    [definitions, earned]
  )
  const negativeDefs = useMemo(
    () => definitions.filter(d => d.is_negative).sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)),
    [definitions]
  )

  const lockedByCategory = useMemo(
    () =>
      CATEGORY_ORDER.reduce<Record<string, AchievementDef[]>>((acc, cat) => {
        const items = lockedDefs.filter(d => d.category === cat)
        if (items.length > 0) acc[cat] = items.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
        return acc
      }, {}),
    [lockedDefs]
  )

  useEffect(() => {
    if (open) {
      fetchRarities()
    }
  }, [open, fetchRarities])

  useEffect(() => {
    if (!open) setActiveTab('all')
  }, [open])

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

  const gridBadgeProps = { size: 'sm' as const, showName: true, variant: 'filled' as const, inGrid: true, embedTooltip: false }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl! max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="pl-6 pr-12 pt-3 pb-3 border-b">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-base shrink-0">
              {isViewingOther
                ? t('achievement.badgesDialog.userBadges', { name: displayName })
                : t('achievement.badgesDialog.myBadges')}
            </DialogTitle>
            {isAdmin && (
              <div className="flex items-center gap-2 shrink-0">
                <Switch id="achievement-show-lock" checked={showLockIcon} onCheckedChange={setShowLockIcon} size="sm" />
                <Label htmlFor="achievement-show-lock" className="text-xs font-normal cursor-pointer flex items-center gap-1.5 text-muted-foreground">
                  {showLockIcon ? <Lock size={12} /> : <Unlock size={12} />}
                  {showLockIcon ? t('achievement.showLock') : t('achievement.showUnlock')}
                </Label>
              </div>
            )}
          </div>
        </DialogHeader>

        <TooltipProvider delayDuration={300}>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6 py-4">
              <TabsList className="h-7 text-xs">
                <TabsTrigger value="all" className="text-xs h-6 gap-1">
                  <Star size={11} />
                  {t('achievement.badgesDialog.tabAll')}
                  <Badge variant="secondary" className="h-4 text-[9px] px-1">
                    {positiveEarned.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="locked" className="text-xs h-6 gap-1">
                  {t('achievement.badgesDialog.tabLocked')}
                  {lockedDefs.length > 0 && (
                    <Badge variant="secondary" className="h-4 text-[9px] px-1">
                      {lockedDefs.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="struggle" className="text-xs h-6 gap-1">
                  {t('achievement.badgesDialog.tabStruggle')}
                  {negativeEarned.length > 0 && (
                    <Badge variant="destructive" className="h-4 text-[9px] px-1">
                      {negativeEarned.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4">
                {activeTab === 'all' &&
                  (loading ? (
                    <div className="text-xs text-muted-foreground text-center py-8">{t('achievement.badgesDialog.loading')}</div>
                  ) : positiveEarned.length > 0 ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                        {t('achievement.badgesDialog.earnedSection', { count: positiveEarned.length })}
                      </div>
                      <div className={GRID_CLASS}>
                        {positiveEarned.map(e => (
                          <BadgeGridCell key={e.achievement_code}>
                            <BadgeCard def={e.def} earned={e} {...gridBadgeProps} rarity={rarities[e.achievement_code]} />
                          </BadgeGridCell>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                      <Star size={32} className="opacity-20" />
                      <p className="text-sm font-medium">{t('achievement.badgesDialog.emptyTitle')}</p>
                      <p className="text-xs opacity-70 text-center max-w-[200px]">{t('achievement.badgesDialog.emptyHint')}</p>
                    </div>
                  ))}
              </TabsContent>

              <TabsContent value="locked" className="mt-4">
                {activeTab === 'locked' &&
                  (loading ? (
                    <div className="text-xs text-muted-foreground text-center py-8">{t('achievement.badgesDialog.loading')}</div>
                  ) : lockedDefs.length > 0 ? (
                    <div className="space-y-1">
                      {!isAdmin && (
                        <p className="text-xs text-muted-foreground mb-3">{t('achievement.badgesDialog.lockedProgressHint')}</p>
                      )}
                      {Object.entries(lockedByCategory).map(([cat, items]) => (
                        <div key={cat} className="mb-4">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
                            {t(`achievement.badgesDialog.category.${cat}`, { defaultValue: cat })} ({items.length})
                          </div>
                          <div className={GRID_CLASS}>
                            {items.map((d: AchievementDef) => (
                              <BadgeGridCell key={d.code}>
                                <BadgeWithProgress
                                  def={d}
                                  stats={(stats as unknown as Partial<Record<string, number>>) ?? {}}
                                  {...gridBadgeProps}
                                  forceUnlocked={isAdmin ? !showLockIcon : false}
                                  rarity={rarities[d.code]}
                                />
                              </BadgeGridCell>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                      <Star size={32} className="opacity-20" />
                      <p className="text-sm font-medium">{t('achievement.badgesDialog.allEarnedTitle')}</p>
                    </div>
                  ))}
              </TabsContent>

              <TabsContent value="struggle" className="mt-4">
                {activeTab === 'struggle' &&
                  (loading ? (
                    <div className="text-xs text-muted-foreground text-center py-8">{t('achievement.badgesDialog.loading')}</div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">{t('achievement.badgesDialog.struggleIntro')}</p>
                      <div className={GRID_CLASS}>
                        {negativeDefs.map(def => {
                          const earnedItem = earnedWithDef.find(e => e.achievement_code === def.code)
                          return (
                            <BadgeGridCell key={def.code}>
                              <BadgeCard
                                def={def}
                                earned={earnedItem ?? undefined}
                                {...gridBadgeProps}
                                forceUnlocked={isAdmin ? !showLockIcon : false}
                                rarity={rarities[def.code]}
                              />
                            </BadgeGridCell>
                          )
                        })}
                      </div>
                      {negativeDefs.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-8">{t('achievement.badgesDialog.noStruggleBadges')}</p>
                      )}
                    </div>
                  ))}
              </TabsContent>
            </Tabs>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  )
}
