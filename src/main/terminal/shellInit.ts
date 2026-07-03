import type { TerminalShellProfileId } from 'shared/terminal/shells'

/**
 * PowerShell prompt + ANSI + OSC 633 cwd reporting for shell integration.
 */
const POWERSHELL_INIT_SCRIPT = `
if ($PSVersionTable.PSVersion.Major -ge 7) { $PSStyle.OutputRendering = 'Ansi' }
Remove-Item Env:NO_COLOR -ErrorAction SilentlyContinue
Remove-Item Env:CI -ErrorAction SilentlyContinue
function global:__hb_osc633([string]$seq) { [Console]::Write([char]27 + "]633;" + $seq + [char]7) }
function global:prompt {
  $path = $PWD.Path
  __hb_osc633 "P;Cwd=$path"
  __hb_osc633 "D;0"
  $e = [char]27
  Write-Host -NoNewline "$e[36mPS$e[0m "
  Write-Host -NoNewline "$e[33m$path$e[0m"
  Write-Host -NoNewline "$e[90m>$e[0m "
  return ' '
}
`.trim()

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

export function resolveShellArgs(profileId: TerminalShellProfileId): string[] {
  if (profileId === 'powershell' || profileId === 'pwsh') {
    return ['-NoLogo', '-NoExit', '-EncodedCommand', encodePowerShellCommand(POWERSHELL_INIT_SCRIPT)]
  }
  return []
}
