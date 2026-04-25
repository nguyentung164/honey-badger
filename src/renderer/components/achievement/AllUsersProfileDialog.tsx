'use client'

import { Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/useAchievementStore'
import { RANK_CONFIG } from './RankBadge'
import { UserProfilePanel } from './UserProfilePanel'

interface UserItem {
  id: string
  userCode: string
  name: string
  email: string
}

interface AllUsersProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase())
    .join('')
    .slice(0, 2)
}

export function AllUsersProfileDialog({ open, onOpenChange }: AllUsersProfileDialogProps) {
  const { t } = useTranslation()
  const fetchLeaderboard = useAchievementStore(s => s.fetchLeaderboard)
  const leaderboard = useAchievementStore(s => s.leaderboard)
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null)
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string | null>>({})
  const fetchedRef = useRef<Set<string>>(new Set())
  const userRanks = leaderboard.reduce<Record<string, string>>((acc, e) => {
    acc[e.user_id] = e.current_rank
    return acc
  }, {})

  const loadUsers = useCallback(async () => {
    if (!open) return
    setLoading(true)
    try {
      const res = await window.api.user.getUsers()
      if (res.status === 'success' && Array.isArray(res.data)) {
        setUsers(res.data)
      } else {
        setUsers([])
      }
    } catch {
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      loadUsers()
      fetchLeaderboard()
      setSelectedUser(null)
    }
  }, [open, loadUsers, fetchLeaderboard])

  useEffect(() => {
    if (!open || users.length === 0) return
    users.forEach(u => {
      if (fetchedRef.current.has(u.id)) return
      fetchedRef.current.add(u.id)
      window.api.user.getAvatarUrl(u.id).then(url => {
        setAvatarUrls(prev => ({ ...prev, [u.id]: url }))
      })
    })
  }, [open, users])

  const handleSelectUser = (u: UserItem) => {
    setSelectedUser({ id: u.id, name: u.name })
  }

  const handleProfileClose = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedUser(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-violet-500" />
              {t('achievement.allUsers')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                <Users size={32} className="opacity-30" />
                <p className="text-sm">{t('achievement.noUsers')}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUser(u)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
                      'hover:bg-muted/70 border border-transparent hover:border-border'
                    )}
                  >
                    {(() => {
                      const rank = userRanks[u.id] ?? 'newbie'
                      const rankCfg = RANK_CONFIG[rank as keyof typeof RANK_CONFIG] ?? RANK_CONFIG.newbie
                      return (
                        <Avatar className={cn('h-9 w-9 shrink-0 ring-2', rankCfg.ringColor)}>
                          {avatarUrls[u.id] && <AvatarImage src={avatarUrls[u.id] ?? ''} alt={u.name} className="object-cover" />}
                          <AvatarFallback className={cn('text-sm font-bold', rankCfg.bgColor, rankCfg.color)}>
                            {getInitials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                      )
                    })()}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.userCode}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedUser && (
        <UserProfilePanel
          open={true}
          onOpenChange={handleProfileClose}
          userId={selectedUser.id}
          userName={selectedUser.name}
          backLabel={t('achievement.backToList')}
        />
      )}
    </>
  )
}
