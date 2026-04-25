import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, HashRouter as Router, Routes } from 'react-router-dom'
import { NotificationSoundProvider } from '@/components/provider/NotificationSoundProvider'
import { TaskAuthStorageSync } from '@/components/provider/TaskAuthStorageSync'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import i18n from '../lib/i18n'
import { MainPage } from '../pages/main/MainPage'
import { useAppearanceStoreSelect } from '../stores/useAppearanceStore'

const CodeDiffViewer = lazy(() => import('../pages/diffviewer/CodeDiffViewer').then(m => ({ default: m.CodeDiffViewer })))
const Dashboard = lazy(() => import('../pages/dashboard/Dashboard').then(m => ({ default: m.Dashboard })))
const ShowLog = lazy(() => import('../pages/showlog/ShowLog').then(m => ({ default: m.ShowLog })))
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
  const setTheme = useAppearanceStoreSelect(s => s.setTheme)
  const setThemeMode = useAppearanceStoreSelect(s => s.setThemeMode)
  const setLanguage = useAppearanceStoreSelect(s => s.setLanguage)
  useEffect(() => {
    setTheme(theme)
    setThemeMode(themeMode)
    document.documentElement.setAttribute('data-font-size', fontSize)
    document.documentElement.setAttribute('data-font-family', fontFamily)
    document.documentElement.setAttribute('data-button-variant', buttonVariant)
    setLanguage(language)
    i18n.changeLanguage(language)
  }, [theme, themeMode, fontSize, fontFamily, buttonVariant, language, setTheme, setThemeMode, setLanguage])
  return (
    <Router>
      <TaskAuthStorageSync />
      <NotificationSoundProvider />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/main" replace />} />
          <Route path="/main" element={<MainPage />} />
          <Route path="/code-diff-viewer" element={<CodeDiffViewer />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/show-log" element={<ShowLog />} />
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
        </Routes>
      </Suspense>
    </Router>
  )
}
