'use client'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import logger from '@/services/logger'

interface InfoDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function InfoDialog({ open, onOpenChange }: InfoDialogProps) {
  const { t } = useTranslation()
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [isLoadingVersion, setIsLoadingVersion] = useState(false)
  useEffect(() => {
    if (open) {
      setIsLoadingVersion(true)
      const getAppVersion = async () => {
        try {
          const version = await window.api.updater.get_version()
          setAppVersion(version)
        } catch (error) {
          logger.error('Error getting app version:', error)
        } finally {
          setIsLoadingVersion(false)
        }
      }
      getAppVersion()
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} aria-label={t('dialog.aboutDialog.title')}>
      <DialogContent className="sm:max-w-[550px]">
        {/* <DialogHeader>
          <DialogTitle>{t('dialog.aboutDialog.title')}</DialogTitle>
          <DialogDescription>{t('dialog.aboutDialog.description')}</DialogDescription>
        </DialogHeader> */}
        <div className="flex flex-col items-center space-y-4 text-sm w-full">
          <div className="w-25 h-25">
            <img src="logo.png" alt="App Logo" className="w-full h-full object-contain dark:brightness-130" />
          </div>
          <table className="text-sm w-full max-w-md">
            <tbody>
              <tr className="h-[25px]">
                <td className="font-semibold">{t('dialog.aboutDialog.developer')}:</td>
                <td>Nguyễn Quang Tùng</td>
              </tr>
              <tr className="h-[25px]">
                <td className="font-semibold">{t('dialog.aboutDialog.email')}:</td>
                <td>quang-tung@system-exe.com.vn</td>
              </tr>
              <tr className="h-[25px]">
                <td className="font-semibold">{t('dialog.aboutDialog.sourceCode')}:</td>
                <td>
                  <a href="https://github.com/systemexe-research-and-development/honey-badger" className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">
                    https://github.com/systemexe-research-and-development/honey-badger
                  </a>
                </td>
              </tr>
              <tr className="h-[25px]">
                <td className="font-semibold">{t('dialog.aboutDialog.version')}:</td>
                <td className="flex items-center gap-1.5">
                  {isLoadingVersion ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
                  {isLoadingVersion ? t('common.loading', 'Đang tải ...') : appVersion}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-center text-muted-foreground m-4">{t('dialog.aboutDialog.thankYou')}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
