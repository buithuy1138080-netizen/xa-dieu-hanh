import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'

// Eagerly loaded (auth-critical, tiny)
import LoginPage from './pages/LoginPage'

// Lazily loaded by route group — splits bundle into per-route chunks
const DashboardPage         = lazy(() => import('./pages/DashboardPage'))
const TaskListPage          = lazy(() => import('./pages/tasks/TaskListPage'))
const TaskDetailPage        = lazy(() => import('./pages/tasks/TaskDetailPage'))
const KanbanPage            = lazy(() => import('./pages/tasks/KanbanPage'))
const OverduePage           = lazy(() => import('./pages/tasks/OverduePage'))
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
const OcrPage               = lazy(() => import('./pages/ocr/OcrPage'))
const OcrResultPage         = lazy(() => import('./pages/ocr/OcrResultPage'))
const ReportCenterPage      = lazy(() => import('./pages/reports/ReportCenterPage'))
const ReportDetailPage      = lazy(() => import('./pages/reports/ReportDetailPage'))
const TemplateManagerPage   = lazy(() => import('./pages/reports/TemplateManagerPage'))
const SyncCenterPage        = lazy(() => import('./pages/gsheet/SyncCenterPage'))
const ZaloNotifPage         = lazy(() => import('./pages/zalo/ZaloNotifPage'))
const StaffPage             = lazy(() => import('./pages/staff/StaffPage'))
const StrategicPage         = lazy(() => import('./pages/strategic/StrategicPage'))
const UserManagementPage    = lazy(() => import('./pages/users/UserManagementPage'))
const DepartmentPage        = lazy(() => import('./pages/departments/DepartmentPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-slate-200" />
          <div className="absolute inset-0 rounded-full border-2 border-t-blue-500 animate-spin" />
        </div>
        <p className="text-sm text-slate-400">Đang tải...</p>
      </div>
    </div>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute><Suspense fallback={<PageLoader />}>{children}</Suspense></ProtectedRoute>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard"          element={<P><DashboardPage /></P>} />
        <Route path="/tasks"              element={<P><TaskListPage /></P>} />
        <Route path="/tasks/:id"          element={<P><TaskDetailPage /></P>} />
        <Route path="/kanban"             element={<P><KanbanPage /></P>} />
        <Route path="/overdue"            element={<P><OverduePage /></P>} />
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
        <Route path="/ocr"                element={<P><OcrPage /></P>} />
        <Route path="/ocr/:id"            element={<P><OcrResultPage /></P>} />
        <Route path="/bao-cao"            element={<P><ReportCenterPage /></P>} />
        <Route path="/bao-cao/:id"        element={<P><ReportDetailPage /></P>} />
        <Route path="/mau-bao-cao"        element={<P><TemplateManagerPage /></P>} />
        <Route path="/dong-bo"            element={<P><SyncCenterPage /></P>} />
        <Route path="/zalo"               element={<P><ZaloNotifPage /></P>} />
        <Route path="/strategic"           element={<P><StrategicPage /></P>} />
        <Route path="/departments"        element={<P><DepartmentPage /></P>} />
        <Route path="/staff"              element={<P><StaffPage /></P>} />
        <Route path="/users"              element={<P><UserManagementPage /></P>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
