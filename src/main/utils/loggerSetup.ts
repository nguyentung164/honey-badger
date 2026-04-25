import log from 'electron-log/main'

const SEP = ' › '

function getCaller(): string {
  try {
    const e = new Error()
    const lines = e.stack?.split('\n') ?? []
    // Bỏ qua getCaller, hook, và electron-log - tìm frame đầu tiên từ code app
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i]
      if (line.includes('electron-log') || line.includes('loggerSetup')) continue
      const m = line.match(/\(([^)]+):\d+:\d+\)/) || line.match(/([^/\\]+\.(tsx?|jsx?)):\d+:\d+/)
      if (m) {
        const path = (m[1] ?? '').replace(/:\d+:\d+$/, '').replace(/\?.*$/, '')
        return path.split(/[/\\]/).pop() ?? path
      }
    }
    return ''
  } catch {
    return ''
  }
}

export function setupElectronLogWithCaller(): void {
  log.hooks.push((message) => {
    const caller = getCaller()
    const levelLabel = (message.level || 'info').toUpperCase()
    message.variables = {
      ...message.variables,
      processType: message.variables?.processType ?? 'main',
      caller: caller ? `[${caller}]${SEP}` : '',
      levelLabel: `[${levelLabel}]`,
    }
    return message
  })

  const format = `[{h}:{i}:{s}.{ms}]${SEP}{caller}{levelLabel}${SEP}{text}`
  log.transports.console.format = format
  log.transports.file.format = format
}
