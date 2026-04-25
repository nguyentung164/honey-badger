import chalk from 'chalk'

// Chrome DevTools hỗ trợ ANSI - cần force chalk vì mặc định tắt màu trong browser
if (typeof window !== 'undefined') {
  chalk.level = 3
}

const customColors = {
  info: { background: '#1e3d8f', text: '#fff' }, // Nền xanh dương đậm, chữ sáng hơn
  success: { background: '#2d6a4f', text: '#fff' }, // Nền xanh lá đậm, chữ sáng hơn
  warning: { background: '#d47a14', text: '#fff' }, // Nền cam đậm, chữ sáng vàng
  error: { background: '#d94c4c', text: '#fff' }, // Nền đỏ đậm, chữ sáng hồng
  debug: { background: '#7a2a8c', text: '#fff' }, // Nền tím đậm, chữ sáng tím nhạt
  caller: { background: '#872191', text: '#fff' }, // Nền teal cho tên file
}
class Logger {
  private isEnabled: boolean

  constructor() {
    this.isEnabled = true
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
  }

  private format(message: any): string {
    if (typeof message === 'object') {
      try {
        return JSON.stringify(message, null, 2)
      } catch {
        return '[Unserializable Object]'
      }
    }
    return String(message)
  }

  private getTimestamp(): string {
    const now = new Date()
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    const ms = String(now.getMilliseconds()).padStart(3, '0')
    return `[${h}:${m}:${s}.${ms}]`
  }

  private getCaller(): string {
    try {
      const e = new Error()
      const lines = e.stack?.split('\n') ?? []
      for (let i = 3; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes('logger.ts')) continue
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

  private static readonly SEP = ' › '

  private logStyled(tag: string, callerTag: string, formatted: string, ...optionalParams: any[]): void {
    // Gộp thành 1 chuỗi để Chrome DevTools giữ nguyên ANSI codes (tránh mất ESC khi pass nhiều args)
    const ts = this.getTimestamp()
    const line = callerTag ? `[FRONTEND] ${ts}${Logger.SEP}${callerTag}${Logger.SEP}${tag}${Logger.SEP}${formatted}` : `[Backend] ${ts}${Logger.SEP}${tag}${Logger.SEP}${formatted}`
    console.log(line, ...optionalParams)
  }

  public info(message: any, ...optionalParams: any[]): void {
    if (!this.isEnabled) return
    const caller = this.getCaller()
    const tag = chalk.bgHex(customColors.info.background).hex(customColors.info.text).bold('[INFO]')
    const callerTag = caller ? chalk.bgHex(customColors.caller.background).hex(customColors.caller.text)(`[${caller}]`) : ''
    this.logStyled(tag, callerTag, this.format(message), ...optionalParams)
  }

  public success(message: any, ...optionalParams: any[]): void {
    if (!this.isEnabled) return
    const caller = this.getCaller()
    const tag = chalk.bgHex(customColors.success.background).hex(customColors.success.text).bold('[SUCCESS]')
    const callerTag = caller ? chalk.bgHex(customColors.caller.background).hex(customColors.caller.text)(`[${caller}]`) : ''
    this.logStyled(tag, callerTag, this.format(message), ...optionalParams)
  }

  public warning(message: any, ...optionalParams: any[]): void {
    if (!this.isEnabled) return
    const caller = this.getCaller()
    const tag = chalk.bgHex(customColors.warning.background).hex(customColors.warning.text).bold('[WARNING]')
    const callerTag = caller ? chalk.bgHex(customColors.caller.background).hex(customColors.caller.text)(`[${caller}]`) : ''
    this.logStyled(tag, callerTag, this.format(message), ...optionalParams)
  }

  public error(message: any, ...optionalParams: any[]): void {
    if (!this.isEnabled) return
    const caller = this.getCaller()
    const tag = chalk.bgHex(customColors.error.background).hex(customColors.error.text).bold('[ERROR]')
    const callerTag = caller ? chalk.bgHex(customColors.caller.background).hex(customColors.caller.text)(`[${caller}]`) : ''
    this.logStyled(tag, callerTag, this.format(message), ...optionalParams)
  }

  public debug(message: any, ...optionalParams: any[]): void {
    if (!this.isEnabled) return
    const caller = this.getCaller()
    const tag = chalk.bgHex(customColors.debug.background).hex(customColors.debug.text).bold('[DEBUG]')
    const callerTag = caller ? chalk.bgHex(customColors.caller.background).hex(customColors.caller.text)(`[${caller}]`) : ''
    this.logStyled(tag, callerTag, this.format(message), ...optionalParams)
  }

  public custom(color: keyof typeof chalk, prefix: string, message: any, ...optionalParams: any[]): void {
    if (!this.isEnabled) return
    const caller = this.getCaller()
    const colorFn = chalk[color] as ((text: string) => string) | undefined
    const styledPrefix = colorFn ? colorFn(prefix) : prefix
    const callerTag = caller ? chalk.bgHex(customColors.caller.background).hex(customColors.caller.text)(`[${caller}]`) : ''
    const ts = this.getTimestamp()
    const line = callerTag ? `${ts}${Logger.SEP}${callerTag}${Logger.SEP}${styledPrefix}${Logger.SEP}${this.format(message)}` : `${ts}${Logger.SEP}${styledPrefix}${Logger.SEP}${this.format(message)}`
    console.log(line, ...optionalParams)
  }

  public multiColor(parts: Array<{ text: string; color: keyof typeof chalk }>): void {
    if (!this.isEnabled) return
    const ts = this.getTimestamp()
    const output = parts.map(({ text, color }) => {
      const colorFn = chalk[color] as ((text: string) => string) | undefined
      return colorFn ? colorFn(text) : text
    })
    console.log(ts + Logger.SEP + output.join(''))
  }
}

const logger = new Logger()
export default logger
