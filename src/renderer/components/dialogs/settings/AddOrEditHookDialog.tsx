'use client'

import { Loader2 } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'
import { useButtonVariant } from '@/stores/useAppearanceStore'

const HOOK_TEMPLATES: Record<string, string> = {
  'pre-commit': `#!/bin/sh
# Run before commit is created
# Exit 0 to allow commit, non-zero to abort
echo "Running pre-commit checks..."
# Add your checks here, e.g.:
# npm run lint
# npm test
exit 0
`,
  'commit-msg': `#!/bin/sh
# Validate commit message. Receives message file as $1
# Exit 0 to allow, non-zero to reject
msg=$(cat "$1")
if [ -z "$msg" ]; then
  echo "Commit message cannot be empty"
  exit 1
fi
exit 0
`,
  'prepare-commit-msg': `#!/bin/sh
# Prepare commit message template. Receives: $1=msg file, $2=source, $3=sha
# Edit the file in place
exit 0
`,
  'post-commit': `#!/bin/sh
# Run after commit is created
# Use for notifications, logging, etc.
exit 0
`,
  'pre-push': `#!/bin/sh
# Run before push. Receives: $1=remote name, $2=remote URL
# Exit 0 to allow push, non-zero to abort
exit 0
`,
  'pre-rebase': `#!/bin/sh
# Run before rebase
exit 0
`,
  'post-merge': `#!/bin/sh
# Run after merge
exit 0
`,
  'post-checkout': `#!/bin/sh
# Run after checkout. Receives: $1=prev HEAD, $2=new HEAD, $3=branch checkout flag
exit 0
`,
}

const SUPPORTED_HOOKS = ['pre-commit', 'commit-msg', 'prepare-commit-msg', 'post-commit', 'pre-push', 'pre-rebase', 'post-merge', 'post-checkout']

interface AddOrEditHookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hookName: string
  hookContent: string
  setHookName: (value: string) => void
  setHookContent: (value: string) => void
  onSave: () => void
  isEditMode?: boolean
  isSaving?: boolean
}

export const AddOrEditHookDialog = memo(function AddOrEditHookDialog({
  open,
  onOpenChange,
  hookName,
  hookContent,
  setHookName,
  setHookContent,
  onSave,
  isEditMode = false,
  isSaving = false,
}: AddOrEditHookDialogProps) {
  const [errorContent, setErrorContent] = useState(false)
  const variant = useButtonVariant()
  const { t } = useTranslation()

  useEffect(() => {
    if (open && !isEditMode) {
      setHookName('')
      setHookContent('')
      setErrorContent(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setHookName/setHookContent from parent are stable
  }, [open, isEditMode])

  const handleLoadTemplate = () => {
    if (hookName && HOOK_TEMPLATES[hookName]) {
      setHookContent(HOOK_TEMPLATES[hookName])
    }
  }

  const handleSave = () => {
    const contentValid = hookContent.trim().length > 0
    setErrorContent(!contentValid)

    if (!hookName) {
      toast.error(t('settings.hooks.selectHook'))
      return
    }

    if (contentValid) {
      onSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? t('settings.hooks.editHook', 'Edit Hook') : t('settings.hooks.addHook', 'Add Hook')}</DialogTitle>
          <DialogDescription>{t('settings.hooks.dialogDescription', 'Hooks must exit with code 0 to succeed. Non-zero exit will abort the operation.')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('settings.hooks.hookType', 'Hook Type')}</Label>
            <Combobox
              value={hookName || ''}
              onValueChange={v => setHookName(v || '')}
              disabled={isEditMode}
              options={SUPPORTED_HOOKS.map(name => ({ value: name, label: name }))}
              placeholder={t('settings.hooks.selectHook', 'Select hook')}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('settings.hooks.scriptContent', 'Script Content')}</Label>
              {hookName && (
                <Button variant="ghost" size="sm" onClick={handleLoadTemplate}>
                  {t('settings.hooks.loadTemplate', 'Load template')}
                </Button>
              )}
            </div>
            <Textarea
              value={hookContent}
              onChange={e => setHookContent(e.target.value)}
              placeholder="#!/bin/sh&#10;# Your script here"
              className="font-mono text-sm min-h-[200px]"
              style={{ fontFamily: 'monospace' }}
            />
            {errorContent && <p className="text-sm text-destructive">{t('settings.hooks.contentRequired', 'Content is required')}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant={variant} onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
