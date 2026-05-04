import { Copy } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast as sonner } from 'sonner'
import logger from '@/services/logger'

export type ToastActionItem = {
  label: string
  onClick: () => void
}

export type ToastExtras = {
  actions?: ToastActionItem[]
}

function stringifyToastMessage(message: unknown): string {
  if (message instanceof Error) return message.message
  return String(message ?? '')
}

function renderActionCluster(actions: ToastActionItem[] | undefined, errorMessageForCopy?: string, showCopy?: boolean): ReactNode {
  const hasExtras = Boolean(actions?.length) || Boolean(showCopy && errorMessageForCopy !== undefined && errorMessageForCopy !== '')
  if (!hasExtras) return undefined
  const copyPayload = errorMessageForCopy ?? ''
  return (
    <div className="flex flex-wrap items-center gap-1">
      {actions?.map((a, i) => (
        <button
          key={i}
          type="button"
          onClick={a.onClick}
          className="rounded border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
        >
          {a.label}
        </button>
      ))}
      {showCopy && copyPayload ? (
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(copyPayload)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'inline-flex',
            alignItems: 'center',
          }}
          aria-label="Copy"
        >
          <Copy size={16} />
        </button>
      ) : null}
    </div>
  )
}

const toast = {
  success: (message: string, extras?: ToastExtras) => {
    logger.success(message)
    sonner.success(message, {
      className: 'toast-success',
      action: renderActionCluster(extras?.actions, undefined, false),
    })
  },

  info: (message: string, extras?: ToastExtras) => {
    logger.info(message)
    sonner.info(message, {
      className: 'toast-info',
      action: renderActionCluster(extras?.actions, undefined, false),
    })
  },

  warning: (message: string, extras?: ToastExtras) => {
    logger.warning(message)
    sonner.warning(message, {
      className: 'toast-warning',
      action: renderActionCluster(extras?.actions, undefined, false),
    })
  },

  error: (message: unknown, extras?: ToastExtras) => {
    logger.error(message)
    const errorMessage = stringifyToastMessage(message)
    sonner.error(errorMessage, {
      className: 'toast-error',
      action: renderActionCluster(extras?.actions, errorMessage, true),
    })
  },
}

export default toast
