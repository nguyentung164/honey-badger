import type { CommitInfo } from 'main/types/types'

/**
 * Queue lưu CommitInfo khi Git commit (chưa push).
 * Gửi mail/Teams khi push thành công thay vì lúc commit,
 * vì Git commit chỉ lưu local, chưa lên remote.
 */
const queue = new Map<string, CommitInfo>()

export function addToQueue(commitHash: string, data: CommitInfo): void {
  queue.set(commitHash, data)
}

export function getFromQueue(commitHash: string): CommitInfo | undefined {
  return queue.get(commitHash)
}

export function removeFromQueue(commitHash: string): void {
  queue.delete(commitHash)
}

export function removeManyFromQueue(commitHashes: string[]): void {
  for (const hash of commitHashes) {
    queue.delete(hash)
  }
}
