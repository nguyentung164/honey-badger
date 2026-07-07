const DEFAULT_MAX_BYTES = 512 * 1024

/** Ring buffer of PTY output for re-attach replay (VS Code revive buffer subset). */
export class PtyOutputBuffer {
  private chunks: string[] = []
  private total = 0

  constructor(private readonly maxBytes = DEFAULT_MAX_BYTES) {}

  append(data: string): void {
    if (!data) return
    this.chunks.push(data)
    this.total += data.length
    while (this.total > this.maxBytes && this.chunks.length > 0) {
      const removed = this.chunks.shift()
      if (removed) this.total -= removed.length
    }
  }

  snapshot(): string {
    return this.chunks.join('')
  }

  clear(): void {
    this.chunks = []
    this.total = 0
  }
}
