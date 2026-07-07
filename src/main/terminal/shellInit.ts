import type { TerminalShellProfileId } from 'shared/terminal/shells'

/**
 * VS Code-aligned OSC 633 shell integration (minimal subset).
 * Sequence semantics: A=prompt start, B=input start, C=execution start, D=finished.
 * @see https://code.visualstudio.com/docs/terminal/shell-integration
 */
const POWERSHELL_INIT_SCRIPT = String.raw`
if ($PSVersionTable.PSVersion.Major -ge 7) { $PSStyle.OutputRendering = 'Ansi' }
Remove-Item Env:NO_COLOR -ErrorAction SilentlyContinue
Remove-Item Env:CI -ErrorAction SilentlyContinue
$Global:__HBState = @{ LastHistoryId = -1; IsInExecution = $false; HasPSReadLine = $false }
function global:__hb_osc633([string]$seq) { [Console]::Write([char]27 + "]633;" + $seq + [char]7) }
function global:prompt {
  $FakeCode = [int]!$global:?
  Set-StrictMode -Off
  $LastHistoryEntry = Get-History -Count 1
  $Result = ""
  if ($Global:__HBState.LastHistoryId -ne -1 -and ($Global:__HBState.HasPSReadLine -eq $false -or $Global:__HBState.IsInExecution -eq $true)) {
    $Global:__HBState.IsInExecution = $false
    if ($LastHistoryEntry.Id -eq $Global:__HBState.LastHistoryId) {
      $Result += "$([char]0x1b)]633;D$([char]7)"
    } else {
      $Result += "$([char]0x1b)]633;D;$FakeCode$([char]7)"
    }
  }
  $Result += "$([char]0x1b)]633;A$([char]7)"
  $path = $PWD.Path
  $Result += "$([char]0x1b)]633;P;Cwd=$path$([char]7)"
  $Result += "$([char]0x1b)[36mPS$([char]0x1b)[0m $([char]0x1b)[33m$path$([char]0x1b)[0m$([char]0x1b)[90m>$([char]0x1b)[0m "
  $Result += "$([char]0x1b)]633;B$([char]7)"
  $Global:__HBState.LastHistoryId = $LastHistoryEntry.Id
  return $Result
}
if (Get-Module -ListAvailable PSReadLine) {
  Import-Module PSReadLine -ErrorAction SilentlyContinue
  if (Get-Module PSReadLine) {
    $Global:__HBState.HasPSReadLine = $true
    __hb_osc633 'P;HasRichCommandDetection=True'
    $Global:__HBState.OriginalPSConsoleHostReadLine = $function:PSConsoleHostReadLine
    function Global:PSConsoleHostReadLine {
      $CommandLine = $Global:__HBState.OriginalPSConsoleHostReadLine.Invoke()
      $Global:__HBState.IsInExecution = $true
      [Console]::Write("$([char]0x1b)]633;C$([char]7)")
      $CommandLine
    }
  }
}
[Console]::Write("$([char]0x1b)]633;P;IsWindows=True$([char]7)")
`.trim()

/** Bash OSC 633 — preexec/precmd pattern from VS Code shellIntegration-bash.sh */
const BASH_ZSH_INIT = String.raw`
__hb_osc633() { printf '\033]633;%s\007' "$1"; }
__hb_in_command_execution=0
__hb_current_command=""
__hb_status=0
__hb_command_output_start() { __hb_osc633 "C"; }
__hb_command_complete() {
  if [ -n "$__hb_current_command" ]; then
    __hb_osc633 "D;$__hb_status"
  else
    __hb_osc633 "D"
  fi
  __hb_osc633 "P;Cwd=$PWD"
}
__hb_preexec() {
  __hb_current_command=$BASH_COMMAND
  __hb_command_output_start
}
__hb_precmd() {
  __hb_status=$?
  __hb_command_complete
  __hb_current_command=""
  __hb_in_command_execution=0
}
__hb_preexec_only() {
  if [ "$__hb_in_command_execution" = "0" ]; then
    __hb_in_command_execution=1
    __hb_preexec
  fi
}
__hb_prompt_cmd() {
  __hb_status=$?
  __hb_precmd
}
if [ -n "$BASH_VERSION" ]; then
  __hb_osc633 "P;HasRichCommandDetection=True"
  trap '__hb_preexec_only' DEBUG
  PROMPT_COMMAND="__hb_prompt_cmd;\${PROMPT_COMMAND:-:}"
elif [ -n "$ZSH_VERSION" ]; then
  __hb_osc633 "P;HasRichCommandDetection=True"
  preexec() { __hb_preexec; }
  precmd() { __hb_precmd; }
fi
`.trim()

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

export function resolveShellArgs(profileId: TerminalShellProfileId): string[] {
  if (profileId === 'powershell' || profileId === 'pwsh') {
    return ['-NoLogo', '-NoExit', '-EncodedCommand', encodePowerShellCommand(POWERSHELL_INIT_SCRIPT)]
  }

  if (process.platform !== 'win32') {
    return ['-l', '-c', `${BASH_ZSH_INIT}; exec -l bash`]
  }

  return []
}
