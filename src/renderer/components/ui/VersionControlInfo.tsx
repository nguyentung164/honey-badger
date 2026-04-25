import { t } from 'i18next'
import { Folder, GitBranch, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import toast from '@/components/ui-elements/Toast'
import logger from '@/services/logger'
import { useConfigurationStore } from '@/stores/useConfigurationStore'

interface VersionControlInfoProps {
  sourceFolder: string
  versionControlSystem: 'svn' | 'git'
  onVersionControlChange: (type: 'svn' | 'git') => void
  onSave?: () => void
  /** Khi true, không chạy detection (get_version_control_details) - dùng khi form có thay đổi chưa lưu */
  deferDetection?: boolean
  /** Khi true, render nội dung không bọc Card (dùng trong dialog) */
  embedded?: boolean
  /** Khi true, chỉ render Badge (dùng cạnh title Source Folder), click mở dialog */
  badgeOnly?: boolean
  onBadgeClick?: () => void
}

export function VersionControlInfo({
  sourceFolder,
  versionControlSystem,
  onVersionControlChange,
  onSave,
  deferDetection = false,
  embedded = false,
  badgeOnly = false,
  onBadgeClick,
}: VersionControlInfoProps) {
  const [detectedType, setDetectedType] = useState<'svn' | 'git' | 'none' | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [isValid, setIsValid] = useState(false)
  const [details, setDetails] = useState<any>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detectVersionControlRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const lastDetectedSourceFolderRef = useRef<string | null>(null)

  const detectVersionControl = useCallback(async () => {
    if (!sourceFolder) return

    setIsDetecting(true)
    setIsInitialLoad(false)
    try {
      const result = await window.api.system.get_version_control_details(sourceFolder)
      const currentVersionControlSystem = useConfigurationStore.getState().versionControlSystem
      if (result.status === 'success' && result.data) {
        setDetectedType(result.data.type)
        setIsValid(result.data.isValid)
        setDetails(result.data.details)

        if (result.data.isValid && result.data.type !== 'none') {
          const didChange = result.data.type !== currentVersionControlSystem
          if (didChange) {
            onVersionControlChange(result.data.type as 'svn' | 'git')
            logger.info(`Đã tự động chuyển sang ${result.data.type.toUpperCase()} repository`)
          }
          lastDetectedSourceFolderRef.current = sourceFolder
          // Chỉ save khi thực sự thay đổi VCS type và form không dirty (tránh ghi đè thay đổi chưa lưu)
          if (didChange && onSave && !deferDetection) {
            setTimeout(() => {
              onSave()
            }, 100)
          }
        }
      } else {
        setDetectedType('none')
        setIsValid(false)
        setDetails(null)
        lastDetectedSourceFolderRef.current = null
      }
    } catch (_error) {
      setDetectedType('none')
      setIsValid(false)
      setDetails(null)
      lastDetectedSourceFolderRef.current = null
      toast.error('Lỗi khi phát hiện version control system')
    } finally {
      setIsDetecting(false)
    }
  }, [sourceFolder, onVersionControlChange, onSave, deferDetection])

  detectVersionControlRef.current = detectVersionControl

  useEffect(() => {
    if (!sourceFolder) {
      lastDetectedSourceFolderRef.current = null
      setIsInitialLoad(true)
      setDetectedType(null)
      setIsValid(false)
      setDetails(null)
      return
    }
    // Khi đổi source folder: luôn chạy detection (git/svn/none). Chỉ skip nếu đã detect đúng folder này.
    if (lastDetectedSourceFolderRef.current === sourceFolder) {
      return
    }
    lastDetectedSourceFolderRef.current = null
    setIsInitialLoad(true)
    setDetectedType(null)
    setIsValid(false)
    setDetails(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      detectVersionControlRef.current()
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [sourceFolder, deferDetection])

  const getStatusColor = () => {
    if (!isValid) return 'destructive'
    if (detectedType === versionControlSystem) return 'default'
    return 'secondary'
  }

  const getStatusText = () => {
    if (isInitialLoad || isDetecting) return 'Đang kiểm tra...'
    if (!sourceFolder) return 'Chưa chọn thư mục'
    if (!isValid) return 'Không phải repository'
    if (detectedType === 'none') return 'Không tìm thấy VCS'
    if (detectedType) return `${detectedType.toUpperCase()}`
    return 'Đang kiểm tra...'
  }

  if (badgeOnly) {
    const badge = (
      <Badge variant={getStatusColor()} className="cursor-pointer hover:opacity-90 transition-opacity">
        {getStatusText()}
      </Badge>
    )
    return onBadgeClick ? (
      <button type="button" onClick={onBadgeClick} className="inline-flex focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md">
        {badge}
      </button>
    ) : (
      badge
    )
  }

  const content = (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          <span>Thư mục: {sourceFolder}</span>
        </div>
      </div>
      {isValid ? (
        <div
          className={`h-34 space-y-2 transition-all duration-300 ${!isInitialLoad && !isDetecting && isValid && detectedType && detectedType !== 'none' ? 'opacity-100' : 'opacity-0'
            }`}
        >
          <div className="text-xs text-muted-foreground space-y-1">
            {detectedType === 'svn' ? (
              <>
                <div>URL: {details?.url ?? '-'}</div>
                <div>Revision: {details?.revision ?? '-'}</div>
                <div>Last Changed Rev: {details?.lastChangedRev ?? '-'}</div>
                <div>Last Changed Date: {details?.lastChangedDate ?? '-'}</div>
                {details?.lastChangedAuthor ? <div>Người commit: {details.lastChangedAuthor}</div> : null}
                <div>Trạng thái: {details?.status ?? '-'}</div>
              </>
            ) : detectedType === 'git' ? (
              <>
                <div>URL: {details?.url ?? '-'}</div>
                <div>Branch: {details?.branch ?? '-'}</div>
                <div className="break-all">Commit: {details?.commit ?? '-'}</div>
                {details?.commitAuthor ? <div>Người commit: {details.commitAuthor}</div> : null}
                <div>Thay đổi: {details?.hasChanges ? 'Có' : 'Không'}</div>
                <div>Trạng thái: {details?.status ?? '-'}</div>
              </>
            ) : (
              <>
                <div>URL: {details?.url}</div>
                <div>Branch: {details?.branch}</div>
                <div>Revision: {details?.revision}</div>
                <div>Thay đổi: {details?.hasChanges ? 'Có' : 'Không'}</div>
                <div>Trạng thái: {details?.status}</div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="h-34 flex items-center justify-center">
          {isInitialLoad || isDetecting ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Đang phát hiện...
            </div>
          ) : (
            <div className="text-sm font-medium text-red-500">Không tìm thấy version control system</div>
          )}
        </div>
      )}
    </div>
  )

  if (embedded) {
    return content
  }

  return (
    <Card className="w-full gap-2 py-4 h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          {t('settings.versioncontrol.title', 'Version Control Info')}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-full">{content}</CardContent>
    </Card>
  )
}
