import type { TerminalShellProfileId } from 'shared/terminal/shells'
import { cn } from '@/lib/utils'

/** VS Code codicons — lucide-react has no PowerShell/CMD brand icons. */
const SHELL_CODICON: Record<TerminalShellProfileId, string> = {
  powershell: 'codicon-terminal-powershell',
  cmd: 'codicon-terminal-cmd',
  pwsh: 'codicon-terminal-powershell',
}

type TerminalShellTabIconProps = {
  shellProfileId: TerminalShellProfileId
  className?: string
}

export function TerminalShellTabIcon({ shellProfileId, className }: TerminalShellTabIconProps) {
  return (
    <span
      className={cn('codicon leading-none text-muted-foreground', SHELL_CODICON[shellProfileId], className)}
      style={{ fontSize: 12 }}
      aria-hidden
    />
  )
}
