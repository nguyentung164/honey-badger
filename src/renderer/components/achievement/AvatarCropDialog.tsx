import { useCallback, useEffect, useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export async function getCroppedImageDataUrl(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not available')
  canvas.width = Math.max(1, Math.round(pixelCrop.width))
  canvas.height = Math.max(1, Math.round(pixelCrop.height))
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height)
  return canvas.toDataURL('image/png')
}

export interface AvatarCropDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageSrc: string | null
  onCropped: (dataUrl: string) => void | Promise<void>
}

export function AvatarCropDialog({ open, onOpenChange, imageSrc, onCropped }: AvatarCropDialogProps) {
  const { t } = useTranslation()
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && imageSrc) {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
    }
  }, [open, imageSrc])

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  const handleOpenChange = (next: boolean) => {
    if (!next) setBusy(false)
    onOpenChange(next)
  }

  const handleApply = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    setBusy(true)
    try {
      const dataUrl = await getCroppedImageDataUrl(imageSrc, croppedAreaPixels)
      await onCropped(dataUrl)
      handleOpenChange(false)
    } catch {
      /* Upload failed: parent already showed toast; keep dialog open. */
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>{t('achievement.avatarCropTitle')}</DialogTitle>
        </DialogHeader>

        {imageSrc ? (
          <div className="relative h-[min(56vh,320px)] w-full overflow-hidden rounded-lg bg-muted">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
          </div>
        ) : null}

        <div className="space-y-2 px-0.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('achievement.avatarCropZoom')}</span>
            <span className="tabular-nums">{zoom.toFixed(2)}×</span>
          </div>
          <Slider min={1} max={3} step={0.02} value={[zoom]} onValueChange={v => setZoom(v[0] ?? 1)} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            {t('achievement.avatarCropCancel')}
          </Button>
          <Button type="button" onClick={() => void handleApply()} disabled={busy || !imageSrc || !croppedAreaPixels}>
            {t('achievement.avatarCropApply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
