import { Component, type ErrorInfo, type ReactNode, useEffect } from 'react'
import ReactDom from 'react-dom/client'
import './lib/i18n'
import { setupElectronLogFormat } from './lib/electronLogSetup'
import { bootstrapPersistedState } from './lib/bootstrapPersistedState'
import { initSyncUiSettings } from './lib/syncUiSettings'

setupElectronLogFormat()
initSyncUiSettings()

import { ThemeProvider } from '@/components/provider/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppRoutes } from './routes/routes'
import { useAppearanceStoreSelect } from './stores/useAppearanceStore'

import './globals.css'

class RootErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }

  static getDerivedStateFromError(err: Error) {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[renderer] RootErrorBoundary', err, info.componentStack)
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui', color: '#b91c1c' }}>
          <h1 style={{ fontSize: 18 }}>Lỗi khởi động giao diện</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 12 }}>{this.state.err.message}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const themeMode = useAppearanceStoreSelect(s => s.themeMode)
  useEffect(() => {
    void import('./fonts.css')
  }, [])
  return (
    <ThemeProvider attribute="class" forcedTheme={themeMode}>
      <TooltipProvider>
        <AppRoutes />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  )
}

const rootEl = document.getElementById('app-root')
if (!rootEl) {
  console.error('[renderer] Thiếu #app-root trong index.html')
} else if (typeof window.api === 'undefined') {
  rootEl.innerHTML = '<div style="padding:24px;font-family:system-ui">Không tải được preload (window.api). Kiểm tra log main / đường dẫn preload.</div>'
} else {
  void bootstrapPersistedState()
    .catch(err => {
      console.error('[renderer] bootstrapPersistedState failed', err)
    })
    .finally(() => {
      ReactDom.createRoot(rootEl).render(
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      )
    })
}
