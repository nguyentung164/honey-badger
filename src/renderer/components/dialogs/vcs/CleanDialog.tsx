'use client'
import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import toast from '@/components/ui-elements/Toast'
import i18n from '@/lib/i18n'
import { useButtonVariant } from '../../../stores/useAppearanceStore'
import { OverlayLoader } from '../../ui-elements/OverlayLoader'

interface CleanDialogProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
}

export function CleanDialog({ open, onOpenChange }: CleanDialogProps) {
  const variant = useButtonVariant()
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const optionMeta = useMemo(
    () => ({
      externals: {
        label: t('dialog.cleanSvn.options.externals.label'),
        description: t('dialog.cleanSvn.options.externals.description'),
      },
      unversioned: {
        label: t('dialog.cleanSvn.options.unversioned.label'),
        description: t('dialog.cleanSvn.options.unversioned.description'),
      },
      ignored: {
        label: t('dialog.cleanSvn.options.ignored.label'),
        description: t('dialog.cleanSvn.options.ignored.description'),
      },
      unused: {
        label: t('dialog.cleanSvn.options.unused.label'),
        description: t('dialog.cleanSvn.options.unused.description'),
      },
    }),
    [t, i18n.language]
  )

  const [checkedOptions, setCheckedOptions] = useState<Record<string, boolean>>({
    externals: true,
    unversioned: false,
    ignored: false,
    unused: true,
  })

  const options = Object.keys(optionMeta).map(id => ({
    id,
    label: optionMeta[id as keyof typeof optionMeta].label,
    description: optionMeta[id as keyof typeof optionMeta].description,
    checked: checkedOptions[id],
  }))

  const toggleOption = (id: string) => {
    setCheckedOptions(prev => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const handleCancel = () => {
    if (onOpenChange) {
      onOpenChange(false)
    }
  }

  const handleClean = async () => {
    setIsLoading(true)
    const selectedOptions = options.filter(option => option.checked).map(option => option.id)
    try {
      const result = await window.api.svn.cleanup(selectedOptions)
      if (result.status === 'success') {
        if (onOpenChange) {
          onOpenChange(false)
        }
        toast.success(t('dialog.cleanSvn.cleanSuccess'))
      } else {
        toast.error(result.message || t('dialog.cleanSvn.cleanError'))
      }
    } catch (_error) {
      toast.error(t('dialog.cleanSvn.cleanError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Trash2 className="h-6 w-6 text-primary" />
            <DialogTitle>{t('dialog.cleanSvn.title')}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="border rounded-md p-4 flex-1 overflow-auto">
          <OverlayLoader isLoading={isLoading} />
          <p className="text-muted-foreground mb-4">{t('dialog.cleanSvn.description')}</p>
          <div className="space-y-4">
            {options.map(option => (
              <div key={option.id} className="flex items-start space-x-2">
                <Checkbox id={option.id} checked={option.checked} onCheckedChange={() => toggleOption(option.id)} />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor={option.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    {option.label}
                  </label>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant={variant} onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant={variant} onClick={handleClean} disabled={isLoading}>
            {t('dialog.cleanSvn.clean')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
