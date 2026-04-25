import { v7 } from 'uuid'

/** UUID v7 (RFC 9562) — có thứ tự thời gian; dùng chung main process và renderer. */
export function randomUuidV7(): string {
  return v7()
}
