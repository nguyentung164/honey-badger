import { FolderOpen, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import toast from '@/components/ui-elements/Toast'
import { useButtonVariant } from '@/stores/useAppearanceStore'
import { useConfigurationStore } from '@/stores/useConfigurationStore'

export async function selectSourceFolder(): Promise<'selected' | 'canceled' | 'invalid'> {
  const sourceFolder = await window.api.system.select_folder()
  if (!sourceFolder?.trim()) return 'canceled'

  const result = await window.api.system.detect_version_control(sourceFolder)
  if (result.status !== 'success') throw new Error(result.message)
  const vcs = result.data?.type
  if (!result.data?.isValid || (vcs !== 'git' && vcs !== 'svn')) return 'invalid'

  const config = { sourceFolder, versionControlSystem: vcs }
  await window.api.configuration.patch(config)
  // Publish the path and detected VCS together so a Git folder never mounts the SVN table.
  useConfigurationStore.setState(config)
  window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
  return 'selected'
}

export function SourceFolderWelcome() {
  const { t } = useTranslation()
  const variant = useButtonVariant()
  const [isSelecting, setIsSelecting] = useState(false)

  const handleSelectFolder = async () => {
    setIsSelecting(true)
    try {
      if ((await selectSourceFolder()) === 'invalid') toast.warning(t('homepage.sourceFolder.invalidRepository'))
    } catch (error) {
      toast.error(t('homepage.sourceFolder.selectError', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      setIsSelecting(false)
    }
  }

  return (
    <Empty className="h-full overflow-auto" aria-labelledby="source-folder-welcome-title" aria-busy={isSelecting}>
      <EmptyHeader>
        <EmptyMedia>
          <FolderOpen aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle id="source-folder-welcome-title">{t('homepage.sourceFolder.title')}</EmptyTitle>
        <EmptyDescription>{t('homepage.sourceFolder.description')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant={variant} size="lg" onClick={handleSelectFolder} disabled={isSelecting}>
          {isSelecting ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : <FolderOpen data-icon="inline-start" aria-hidden="true" />}
          {t(isSelecting ? 'common.loading' : 'homepage.sourceFolder.selectFolder')}
        </Button>
      </EmptyContent>
    </Empty>
  )
}
