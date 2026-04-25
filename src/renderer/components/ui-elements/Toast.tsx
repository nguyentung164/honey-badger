import { Copy } from 'lucide-react'
import { toast as sonner } from 'sonner'
import logger from '@/services/logger'

const toast = {
  success: (message: string) => {
    logger.success(message)
    sonner.success(message, { className: 'toast-success' })
  },

  info: (message: string) => {
    logger.info(message)
    sonner.info(message, { className: 'toast-info' })
  },

  warning: (message: string) => {
    logger.warning(message)
    sonner.warning(message, { className: 'toast-warning' })
  },

  error: (message: any) => {
    logger.error(message)
    const errorMessage = message instanceof Error ? message.message : String(message)
    sonner.error(errorMessage, {
      className: 'toast-error',
      action: (
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(errorMessage ?? '')}
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
      ),
    })
  },
}

export default toast
