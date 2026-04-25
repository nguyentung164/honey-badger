import { Minus, RefreshCcw, Square, X } from 'lucide-react'
import { IPC } from 'main/constants'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

interface GitBlameToolbarProps {
  filePath: string
  onRefresh: () => void
}

export function GitBlameToolbar({ filePath, onRefresh }: GitBlameToolbarProps) {
  const handleClose = () => {
    window.api.electron.send(IPC.WINDOW.ACTION, 'close')
  }

  const handleMinimize = () => {
    window.api.electron.send(IPC.WINDOW.ACTION, 'minimize')
  }

  const handleMaximize = () => {
    window.api.electron.send(IPC.WINDOW.ACTION, 'maximize')
  }

  return (
    <div className="h-10 flex items-center justify-between border-b border-border bg-background px-3 select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-2 flex-1">
        <h1 className="text-sm font-semibold">Git Blame</h1>
        <Separator orientation="vertical" className="h-4" />
        <span className="text-xs text-muted-foreground truncate">{filePath}</span>
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefresh} title="Làm mới">
          <RefreshCcw className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent" onClick={handleMinimize}>
          <Minus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent" onClick={handleMaximize}>
          <Square className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
