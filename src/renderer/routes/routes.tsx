import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, HashRouter as Router, Routes } from 'react-router-dom'
import { handoffDevPipelinesToMainShell, handoffShowLogToMainShell } from 'shared/mainShellView'
import { canOpenDevPipelinesEmbedded } from '@/lib/mainShellTabAccess'
import { canOpenShowLogEmbedded } from '@/lib/openShowLog'
import { NotificationSoundProvider } from '@/components/provider/NotificationSoundProvider'
import { CommitWorkflowGlobalDialogs } from '@/components/commit-workflow/CommitWorkflowGlobalDialogs'
import { useCommitWorkflowStore } from '@/lib/commitWorkflow/commitWorkflowUtils'
import { TaskAuthStorageSync } from '@/components/provider/TaskAuthStorageSync'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { applyAppearanceToDocument } from '../lib/syncUiSettings'
import i18n from '../lib/i18n'
import { MainPage } from '../pages/main/MainPage'
import { useAppearanceStoreSelect } from '../stores/useAppearanceStore'

const CodeDiffViewer = lazy(() => import('../pages/diffviewer/CodeDiffViewer').then(m => ({ default: m.CodeDiffViewer })))
const ShowLogPageStandalone = lazy(() =>
  import('../pages/showlog/ShowLog').then(m => ({ default: () => <m.default mode="standalone" /> }))
)
const SpotBugs = lazy(() => import('../pages/spotbugs/SpotBugs').then(m => ({ default: m.SpotBugs })))
const CheckCodingRules = lazy(() => import('../pages/checkcodingrule/CheckCodingRules').then(m => ({ default: m.CheckCodingRules })))
const CommitMessageHistory = lazy(() => import('../pages/commitmessagehistory/CommitMessageHistory').then(m => ({ default: m.CommitMessageHistory })))
const MergeSvn = lazy(() => import('../pages/mergesvn/MergeSvn').then(m => ({ default: m.MergeSvn })))
const GitBlame = lazy(() => import('../pages/gitblame/GitBlame').then(m => ({ default: m.GitBlame })))
const ConflictResolver = lazy(() => import('../pages/conflictresolver/ConflictResolver').then(m => ({ default: m.ConflictResolver })))
const TaskManagement = lazy(() => import('../pages/taskmanagement/TaskManagement').then(m => ({ default: m.TaskManagement })))
const Master = lazy(() => import('../pages/master/Master').then(m => ({ default: m.Master })))
const EVMTool = lazy(() => import('../pages/evm/EVMTool').then(m => ({ default: m.EVMTool })))
const AppLogViewer = lazy(() => import('../pages/applogs/AppLogViewer').then(m => ({ default: m.AppLogViewer })))
const ProgressTrackingPage = lazy(() => import('../pages/progress/ProgressTrackingPage').then(m => ({ default: m.ProgressTrackingPage })))
const TeamProgressOverviewPage = lazy(() => import('../pages/progress/TeamProgressOverviewPage').then(m => ({ default: m.TeamProgressOverviewPage })))
const ReportManagerPage = lazy(() => import('../pages/reportmanager/ReportManagerPage').then(m => ({ default: m.ReportManagerPage })))
const PrManager = lazy(() => import('../pages/prmanager/PrManager').then(m => ({ default: m.PrManager })))
const AutomationPageStandalone = lazy(() =>
  import('../pages/automation/AutomationPage').then(m => ({ default: () => <m.AutomationPage mode="standalone" /> }))
)
const DevPipelinesPageStandalone = lazy(() =>
  import('../pages/dev-pipelines/DevPipelinesPage').then(m => ({ default: () => <m.default mode="standalone" /> }))
)

/** Legacy #/dev-pipelines trong main window → tab Dev Pipelines trên /main (guest → standalone). */
function DevPipelinesMainShellRedirect() {
  if (canOpenDevPipelinesEmbedded()) {
    handoffDevPipelinesToMainShell()
    return <Navigate to="/main" replace />
  }
  return <Navigate to="/dev-pipelines-standalone" replace />
}

/** Legacy #/show-log trong main window → tab Show Log trên /main (guest → standalone). */
function ShowLogMainShellRedirect() {
  if (canOpenShowLogEmbedded()) {
    handoffShowLogToMainShell()
    return <Navigate to="/main" replace />
  }
  return <Navigate to="/show-log-standalone" replace />
}

/** Legacy hash routes — open dialog instead of standalone pages. */
function CommitQualityLegacyRedirect() {
  useEffect(() => {
    useCommitWorkflowStore.getState().setQualityDialogOpen(true)
  }, [])
  return <Navigate to="/main" replace />
}

function PageFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <GlowLoader className="w-10 h-10" />
    </div>
  )
}

export function AppRoutes() {
  const theme = useAppearanceStoreSelect(s => s.theme)
  const themeMode = useAppearanceStoreSelect(s => s.themeMode)
  const fontSize = useAppearanceStoreSelect(s => s.fontSize)
  const fontFamily = useAppearanceStoreSelect(s => s.fontFamily)
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const language = useAppearanceStoreSelect(s => s.language)
  // Re-apply persisted appearance to DOM on load — do not call setTheme/setThemeMode here
  // (those persist to localStorage + main IPC and can race zustand rehydration on startup).
  useEffect(() => {
    applyAppearanceToDocument({ theme, themeMode, fontSize, fontFamily, buttonVariant })
  }, [theme, themeMode, fontSize, fontFamily, buttonVariant])

  // i18n only when language actually changes — avoid languageChanged on theme/font toggles
  // (that would retrigger TitleBar folder sync via unstable `t` in effect deps).
  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language)
    }
  }, [language])
  return (
    <Router>
      <TaskAuthStorageSync />
      <NotificationSoundProvider />
      <CommitWorkflowGlobalDialogs />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/main" replace />} />
          <Route path="/main" element={<MainPage />} />
          <Route path="/code-diff-viewer" element={<CodeDiffViewer />} />
          <Route path="/show-log" element={<ShowLogMainShellRedirect />} />
          <Route path="/show-log-standalone" element={<ShowLogPageStandalone />} />
          <Route path="/app-logs" element={<AppLogViewer />} />
          <Route path="/spotbugs" element={<SpotBugs />} />
          <Route path="/check-coding-rules" element={<CheckCodingRules />} />
          <Route path="/commit-message-history" element={<CommitMessageHistory />} />
          <Route path="/merge-svn" element={<MergeSvn />} />
          <Route path="/conflict-resolver" element={<ConflictResolver />} />
          <Route path="/task-management" element={<TaskManagement />} />
          <Route path="/master" element={<Master />} />
          <Route path="/evm-tool" element={<EVMTool />} />
          <Route path="/daily-report" element={<Navigate to="/progress?section=dailyreport" replace />} />
          <Route path="/gitblame" element={<GitBlame />} />
          <Route path="/progress" element={<ProgressTrackingPage />} />
          <Route path="/team-progress" element={<TeamProgressOverviewPage />} />
          <Route path="/report-manager" element={<ReportManagerPage />} />
          <Route path="/pr-manager" element={<PrManager />} />
          <Route path="/automation" element={<AutomationPageStandalone />} />
          <Route path="/dev-pipelines" element={<DevPipelinesMainShellRedirect />} />
          <Route path="/dev-pipelines-standalone" element={<DevPipelinesPageStandalone />} />
          <Route path="/commit-quality" element={<CommitQualityLegacyRedirect />} />
          <Route path="/commit-workflow-editor" element={<DevPipelinesMainShellRedirect />} />
        </Routes>
      </Suspense>
    </Router>
  )
}
