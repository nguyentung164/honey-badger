'use client'

import { useState } from 'react'
import { CommitMessageHistoryContent } from './CommitMessageHistoryContent'
import { CommitMessageHistoryToolbar } from './CommitMessageHistoryToolbar'

export function CommitMessageHistory() {
  const [isLoading, setIsLoading] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

  return (
    <div className="relative flex h-screen w-full flex-col">
      <CommitMessageHistoryToolbar onRefresh={() => setReloadNonce(n => n + 1)} isLoading={isLoading} />
      <div className="flex h-full flex-1 flex-col space-y-4 overflow-hidden p-4">
        <CommitMessageHistoryContent enabled reloadNonce={reloadNonce} onLoadingChange={setIsLoading} />
      </div>
    </div>
  )
}
