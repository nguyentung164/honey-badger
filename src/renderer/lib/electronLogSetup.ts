/**
 * Cấu hình electron-log trong renderer để hiển thị đúng format khi nhận log từ main process
 */
import log from 'electron-log/renderer'

const SEP = ' › '

function setupElectronLogFormat(): void {
  log.hooks.push((message) => {
    const levelLabel = (message.level || 'info').toUpperCase()
    const vars = (message.variables ?? {}) as Record<string, unknown>
    message.variables = {
      processType: String(vars.processType ?? 'renderer'),
      ...vars,
      caller: vars.caller ?? '',
      levelLabel: vars.levelLabel ?? `[${levelLabel}]`,
    }
    return message
  })

  log.transports.console.format = `[BACKEND ] [{h}:{i}:{s}.{ms}]${SEP}{caller}{levelLabel}${SEP}{text}`
}

export { setupElectronLogFormat }
