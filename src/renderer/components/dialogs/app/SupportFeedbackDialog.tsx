'use client'
import { ImagePlus, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'
import logger from '@/services/logger'
import { useButtonVariant } from '@/stores/useAppearanceStore'
import { GlowLoader } from '../../ui-elements/GlowLoader'

interface SupportFeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FeedbackType = 'support' | 'feedback'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const SupportFeedbackDialog = ({ open, onOpenChange }: SupportFeedbackDialogProps) => {
  const { t } = useTranslation()
  const [type, setType] = useState<FeedbackType>('support')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState(false)
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [isSending, setIsSending] = useState(false)
  const variant = useButtonVariant()

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const filesToProcess = images.length + acceptedFiles.length > 5 ? acceptedFiles.slice(0, 5 - images.length) : acceptedFiles
      if (images.length + acceptedFiles.length > 5) {
        toast.warning(t('dialog.supportFeedback.tooManyImages'))
      }
      for (const file of filesToProcess) {
        if (!file.type.startsWith('image/')) {
          toast.warning(t('dialog.supportFeedback.onlyImages'))
          continue
        }
        const reader = new FileReader()
        reader.onload = () => {
          setImages(prev => [...prev, reader.result as string])
        }
        reader.readAsDataURL(file)
      }
    },
    [images, t]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif'],
    },
    maxSize: 5242880,
  })

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const validateEmail = (email: string) => {
    const isValid = EMAIL_REGEX.test(email)
    setEmailError(!isValid)
    return isValid
  }

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value
    setEmail(newEmail)
    if (newEmail) validateEmail(newEmail)
  }

  const handleSend = async () => {
    if (!validateEmail(email) || !message) {
      toast.warning(t('dialog.supportFeedback.validationWarning'))
      return
    }

    setIsSending(true)
    try {
      const result = await window.api.notification.send_support_feedback({
        type,
        email,
        message,
        images,
      })
      if (result.status === 'success') {
        toast.success(t('dialog.supportFeedback.sendSuccess'))
        setEmail('')
        setMessage('')
        setImages([])
        onOpenChange(false)
      } else {
        logger.error('Error sending feedback:', result.message)
        toast.error(result.message)
      }
    } catch (error: any) {
      logger.error('Error sending feedback IPC:', error)
      toast.error(error.message)
    } finally {
      setIsSending(false)
    }
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  const handleOpenChange = (newOpenState: boolean) => {
    if (!newOpenState) {
      setType('support')
      setEmail('')
      setEmailError(false)
      setMessage('')
      setImages([])
      setIsSending(false)
    }
    onOpenChange(newOpenState)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('dialog.supportFeedback.title')}</DialogTitle>
          <DialogDescription>{t('dialog.supportFeedback.description')}</DialogDescription>
        </DialogHeader>

        {/* <OverlayLoader isLoading={isSending} /> */}
        <div className="space-y-4 min-h-[450px]">
          <div className="space-y-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">
                {t('dialog.supportFeedback.typeLabel')}
              </Label>
              <Combobox
                value={type}
                onValueChange={v => setType(v as FeedbackType)}
                options={[
                  { value: 'support', label: t('dialog.supportFeedback.typeSupport') },
                  { value: 'feedback', label: t('dialog.supportFeedback.typeFeedback') },
                ]}
                placeholder={t('dialog.supportFeedback.typePlaceholder')}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                {t('dialog.supportFeedback.emailLabel')}*
              </Label>
              <div className="col-span-3">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  className={emailError ? 'border-red-500' : ''}
                  placeholder={t('dialog.supportFeedback.emailPlaceholder')}
                  required
                />
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Message Section */}
          <div className="space-y-2">
            <Label htmlFor="message">{t('dialog.supportFeedback.messageLabel')}</Label>
            <Textarea
              id="message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              spellCheck={false}
              className="min-h-[120px]"
              placeholder={t('dialog.supportFeedback.messagePlaceholder')}
            />
          </div>

          <Separator className="my-4" />

          {/* Images Section */}
          <div className="space-y-2">
            <Label>{t('dialog.supportFeedback.imagesTitle')}</Label>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors
                  ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
            >
              <input {...getInputProps()} />
              <ImagePlus className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-1 text-sm text-muted-foreground">{isDragActive ? t('dialog.supportFeedback.dropHere') : t('dialog.supportFeedback.dragImages')}</p>
              <p className="text-xs text-muted-foreground">{t('dialog.supportFeedback.imageLimit')}</p>
            </div>

            {images.length > 0 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {images.map((image, index) => (
                  <div key={index} className="relative group">
                    <img src={image} alt={`Uploaded ${index + 1}`} className="h-16 w-full object-cover rounded-md" />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 bg-black/70 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant={variant} onClick={handleCancel} disabled={isSending}>
            {t('common.cancel')}
          </Button>
          <Button
            className={`relative ${isSending ? 'border-effect' : ''} ${isSending ? 'cursor-progress' : ''}`}
            variant={variant}
            onClick={() => {
              if (!isSending) {
                handleSend()
              }
            }}
          >
            {isSending ? <GlowLoader /> : null} {isSending ? t('common.sending') : t('common.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
