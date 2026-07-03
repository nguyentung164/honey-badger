'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type EditorGoToLineDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  maxLine?: number
  onGoTo: (line: number, column?: number) => void
}

function parseGoToLineInput(input: string): { line: number; column?: number } | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const [linePart, colPart] = trimmed.split(/[:,]/)
  const line = Number.parseInt(linePart, 10)
  if (!Number.isFinite(line) || line < 1) return null
  const column = colPart != null ? Number.parseInt(colPart, 10) : undefined
  return { line, column: column != null && Number.isFinite(column) && column > 0 ? column : undefined }
}

export function EditorGoToLineDialog({ open, onOpenChange, maxLine, onGoTo }: EditorGoToLineDialogProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  useEffect(() => {
    if (open) setValue('')
  }, [open])

  const submit = () => {
    const parsed = parseGoToLineInput(value)
    if (!parsed) return
    const line = maxLine ? Math.min(parsed.line, maxLine) : parsed.line
    onGoTo(line, parsed.column)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('editor.goToLineTitle')}</DialogTitle>
          <DialogDescription>{t('editor.goToLineHint')}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="42  or  42:10"
          className="font-mono"
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={submit}>
            {t('editor.goToLineGo')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
