import { Component, Suspense, lazy, useEffect } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(e: Error) { return { error: e } }
  render() {
    const { error } = this.state
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white rounded-2xl border border-red-200 shadow-lg p-6 max-w-lg w-full">
            <h2 className="text-red-600 font-bold text-lg mb-2">Lỗi tải trang</h2>
            <pre className="text-xs bg-red-50 text-red-700 p-3 rounded-lg overflow-auto mb-4 whitespace-pre-wrap">{error.message}{'\n'}{error.stack}</pre>
            <button onClick={() => this.setState({ error: null })}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
              Thử lại
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Lazily loaded by route group — splits bundle into per-route chunks
const DashboardPage         = lazy(() => import('./pages/DashboardPage'))
const TaskListPage          = lazy(() => import('./pages/tasks/TaskListPage'))
const TaskDetailPage        = lazy(() => import('./pages/tasks/TaskDetailPage'))
const DocumentListPage      = lazy(() => import('./pages/documents/DocumentListPage'))
const DocumentDetailPage    = lazy(() => import('./pages/documents/DocumentDetailPage'))
const DirectiveListPage     = lazy(() => import('./pages/directives/DirectiveListPage'))
const DirectiveDetailPage   = lazy(() => import('./pages/directives/DirectiveDetailPage'))
const KPIDashboardPage      = lazy(() => import('./pages/kpi/KPIDashboardPage'))
const KPIDetailPage         = lazy(() => import('./pages/kpi/KPIDetailPage'))
const KPIUnifiedPage        = lazy(() => import('./pages/kpi/KPIUnifiedPage'))
const NQ57DashboardPage     = lazy(() => import('./pages/nq57/NQ57DashboardPage'))
const NghiQuyetListPage     = lazy(() => import('./pages/nghi-quyet/NghiQuyetListPage'))
const NghiQuyetDashboardPage = lazy(() => import('./pages/nghi-quyet/NghiQuyetDashboardPage'))
const KpiCLPage             = lazy(() => import('./pages/kpi-chien-luoc/KpiCLPage'))
const ReportCenterPage      = lazy(() => import('./pages/reports/ReportCenterPage'))
const ReportDetailPage      = lazy(() => import('./pages/reports/ReportDetailPage'))
const TemplateManagerPage   = lazy(() => import('./pages/reports/TemplateManagerPage'))
const SyncCenterPage        = lazy(() => import('./pages/gsheet/SyncCenterPage'))
const ZaloNotifPage         = lazy(() => import('./pages/zalo/ZaloNotifPage'))
const StaffPage             = lazy(() => import('./pages/staff/StaffPage'))
const StrategicPage         = lazy(() => import('./pages/strategic/StrategicPage'))
const UserManagementPage    = lazy(() => import('./pages/users/UserManagementPage'))
const DepartmentPage        = lazy(() => import('./pages/departments/DepartmentPage'))
const ProgramsPage          = lazy(() => import('./pages/programs/ProgramsPage'))
const PublicMeetingsPage    = lazy(() => import('./pages/public/PublicMeetingsPage'))
const CapturePage           = lazy(() => import('./pages/capture/CapturePage'))
const BookmarkletGuidePage  = lazy(() => import('./pages/capture/BookmarkletGuidePage'))

function PageLoader() {
  return (
    <div className="p-6 space-y-4 max-w-[1600px]">
      <div className="skeleton h-7 w-48 mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-32 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ProtectedRoute>
        <Suspense fallback={<PageLoader />}>
          <div style={{ animation: 'pageFadeIn 0.12s ease-out' }}>
            {children}
          </div>
        </Suspense>
      </ProtectedRoute>
    </ErrorBoundary>
  )
}

// Preload all lazy chunks in background after first render
const _preloadAll = () => {
  const chunks = [
    () => import('./pages/DashboardPage'),
    () => import('./pages/tasks/TaskListPage'),
    () => import('./pages/tasks/TaskDetailPage'),
    () => import('./pages/documents/DocumentListPage'),
    () => import('./pages/documents/DocumentDetailPage'),
    () => import('./pages/directives/DirectiveListPage'),
    () => import('./pages/directives/DirectiveDetailPage'),
    () => import('./pages/kpi/KPIDashboardPage'),
    () => import('./pages/kpi/KPIDetailPage'),
    () => import('./pages/kpi/KPIUnifiedPage'),
    () => import('./pages/nq57/NQ57DashboardPage'),
    () => import('./pages/nghi-quyet/NghiQuyetListPage'),
    () => import('./pages/nghi-quyet/NghiQuyetDashboardPage'),
    () => import('./pages/kpi-chien-luoc/KpiCLPage'),
    () => import('./pages/reports/ReportCenterPage'),
    () => import('./pages/staff/StaffPage'),
    () => import('./pages/strategic/StrategicPage'),
    () => import('./pages/departments/DepartmentPage'),
    () => import('./pages/programs/ProgramsPage'),
  ]
  // Stagger preloads so they don't compete with the current page load
  chunks.forEach((load, i) => setTimeout(load, 1000 + i * 150))
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/capture" element={<Suspense fallback={<PageLoader />}><CapturePage /></Suspense>} />
        <Route path="/capture/guide" element={<P><BookmarkletGuidePage /></P>} />
        <Route path="/public/meetings" element={<Suspense fallback={<PageLoader />}><PublicMeetingsPage /></Suspense>} />
        <Route path="/dashboard"          element={<P><DashboardPage /></P>} />
        <Route path="/tasks"              element={<P><TaskListPage /></P>} />
        <Route path="/tasks/:id"          element={<P><TaskDetailPage /></P>} />
        <Route path="/kanban"             element={<Navigate to="/tasks?view=kanban" replace />} />
        <Route path="/overdue"            element={<Navigate to="/tasks?view=overdue" replace />} />
        <Route path="/documents"          element={<P><DocumentListPage /></P>} />
        <Route path="/documents/:id"      element={<P><DocumentDetailPage /></P>} />
        <Route path="/directives"         element={<P><DirectiveListPage /></P>} />
        <Route path="/directives/:id"     element={<P><DirectiveDetailPage /></P>} />
        <Route path="/kpi"                element={<P><KPIDashboardPage /></P>} />
        <Route path="/kpi/:id"            element={<P><KPIDetailPage /></P>} />
        <Route path="/kpi-tong-hop"       element={<P><KPIUnifiedPage /></P>} />
        <Route path="/nq57"               element={<P><NQ57DashboardPage /></P>} />
        <Route path="/nghi-quyet"         element={<P><NghiQuyetListPage /></P>} />
        <Route path="/nghi-quyet/:id"     element={<P><NghiQuyetDashboardPage /></P>} />
        <Route path="/kpi-cl"             element={<P><KpiCLPage /></P>} />
        <Route path="/bao-cao"            element={<P><ReportCenterPage /></P>} />
        <Route path="/bao-cao/:id"        element={<P><ReportDetailPage /></P>} />
        <Route path="/mau-bao-cao"        element={<P><TemplateManagerPage /></P>} />
        <Route path="/dong-bo"            element={<P><SyncCenterPage /></P>} />
        <Route path="/zalo"               element={<P><ZaloNotifPage /></P>} />
        <Route path="/programs"           element={<P><ProgramsPage /></P>} />
        <Route path="/strategic"           element={<P><StrategicPage /></P>} />
        <Route path="/departments"        element={<P><DepartmentPage /></P>} />
        <Route path="/staff"              element={<P><StaffPage /></P>} />
        <Route path="/users"              element={<P><UserManagementPage /></P>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
  )
}

export default function App() {
  useEffect(() => { _preloadAll() }, [])
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  )
}
