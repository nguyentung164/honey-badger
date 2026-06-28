/** Index of the pre-rename stash entry after `git stash store` inserts at the top. */
export function getStashDropIndexAfterRenameStore(stashIndex: number): number {
  if (!Number.isInteger(stashIndex) || stashIndex < 0) {
    throw new Error(`Invalid stash index: ${stashIndex}`)
  }
  return stashIndex + 1
}

export function isStashRenameNoOp(currentMessage: string, newMessage: string): boolean {
  return currentMessage.trim() === newMessage.trim()
}

export type StashRenameErrorCode =
  | 'NOT_A_REPO'
  | 'STASH_MESSAGE_REQUIRED'
  | 'STASH_NOT_FOUND'
  | 'STASH_UNCHANGED'
  | 'STASH_RENAME_DROP_FAILED'
  | 'STASH_RENAME_FAILED'
