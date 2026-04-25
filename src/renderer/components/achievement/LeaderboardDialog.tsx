'use client'

import { Crown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Leaderboard } from './Leaderboard'
import { UserProfilePanel } from './UserProfilePanel'

interface LeaderboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin?: boolean
}

interface ProjectItem {
  id: string
  name: string
}

type PickerScope = 'admin' | 'managed' | 'dev'

export function LeaderboardDialog({ open, onOpenChange, isAdmin = false }: LeaderboardDialogProps) {
  const { t } = useTranslation()
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null)
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [pickerScope, setPickerScope] = useState<PickerScope | null>(null)
  const [pickerReady, setPickerReady] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')

  useEffect(() => {
    if (!open) {
      setSelectedProjectId('all')
      setPickerScope(null)
      setPickerReady(false)
      setProjects([])
      return
    }
    setPickerReady(false)
    setPickerScope(null)
    window.api.task
      .getProjectsForLeaderboardPicker()
      .then(res => {
        if (res.status === 'success' && res.data) {
          const { scope, projects: list } = res.data
          const mapped = (list ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
          setPickerScope(scope)
          setProjects(mapped)
          if (scope === 'admin') {
            setSelectedProjectId('all')
          } else if (mapped.length >= 1) {
            setSelectedProjectId(mapped[0].id)
          } else {
            setSelectedProjectId('all')
          }
        } else {
          setPickerScope('dev')
          setProjects([])
          setSelectedProjectId('all')
        }
      })
      .catch(() => {
        setPickerScope('dev')
        setProjects([])
        setSelectedProjectId('all')
      })
      .finally(() => setPickerReady(true))
  }, [open])

  const handleUserClick = (userId: string, userName: string) => {
    if (isAdmin) setSelectedUser({ id: userId, name: userName })
  }

  const handleProfileClose = (isOpen: boolean) => {
    if (!isOpen) setSelectedUser(null)
  }

  /** Admin: có "Tất cả"; PL/PM/Dev: chỉ danh sách project theo scope. */
  const projectOptions = useMemo(() => {
    if (pickerScope === 'admin') {
      return [{ value: 'all', label: 'Tất cả dự án' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
    }
    return projects.map(p => ({ value: p.id, label: p.name }))
  }, [pickerScope, projects])

  /**
   * Admin: >1 project → combobox (all + từng project).
   * PL/PM / Dev: ≥2 project trong phạm vi của họ → combobox; 1 project → ẩn.
   */
  const showProjectCombobox =
    pickerReady &&
    ((pickerScope === 'admin' && projects.length > 1) ||
      ((pickerScope === 'managed' || pickerScope === 'dev') && projects.length > 1))

  /** undefined = không có dự án / chưa tải xong picker; null = bảng toàn hệ (chỉ admin); string = theo project. */
  const leaderboardProjectId = useMemo((): string | null | undefined => {
    if (!pickerReady || pickerScope === null) return undefined
    if (pickerScope === 'admin') {
      return selectedProjectId === 'all' ? null : selectedProjectId
    }
    if (projects.length === 0) return undefined
    const first = projects[0]
    return selectedProjectId === 'all' ? first.id : selectedProjectId
  }, [pickerReady, pickerScope, projects, selectedProjectId])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0 border-0">
          {/* Header */}
          <DialogHeader className="px-5 pt-4 pb-3 border-b border-border/50 shrink-0">
            <div className="flex flex-col items-center gap-2">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Crown className="h-4 w-4 text-amber-500" />
                {t('achievement.leaderboard')}
              </DialogTitle>
              {showProjectCombobox && (
                <Combobox
                  value={selectedProjectId}
                  onValueChange={setSelectedProjectId}
                  options={projectOptions}
                  searchPlaceholder="Tìm dự án..."
                  emptyText="Không tìm thấy dự án"
                  size="sm"
                  className="w-[200px]"
                  triggerClassName="text-xs px-3 py-0 justify-center"
                />
              )}
            </div>
          </DialogHeader>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden px-3 pb-4">
            {!pickerReady ? (
              <div className="flex flex-1 min-h-[13rem] items-center justify-center text-sm text-muted-foreground">
                Đang tải…
              </div>
            ) : (
              <Leaderboard
                open={open}
                isAdmin={isAdmin}
                projectId={leaderboardProjectId}
                onUserClick={handleUserClick}
              />
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
        />
      )}
    </>
  )
}
