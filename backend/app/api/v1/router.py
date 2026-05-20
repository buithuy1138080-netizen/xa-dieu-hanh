from fastapi import APIRouter

from app.api.v1.endpoints import auth, dashboard, departments, directives, documents, gsheet_sync, kpi, kpi_chien_luoc, kpi_unified, nghi_quyet, notifications, nq57, ocr, report_templates, reports, staff, strategic, tasks, users, ws, zalo

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(departments.router, prefix="/departments", tags=["departments"])
api_router.include_router(staff.router, prefix="/staff", tags=["staff"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(directives.router, prefix="/directives", tags=["directives"])
api_router.include_router(kpi.router, prefix="/kpi", tags=["kpi"])
api_router.include_router(nq57.router, prefix="/nq57", tags=["nq57"])
api_router.include_router(nghi_quyet.router, prefix="/nghi-quyet", tags=["nghi-quyet"])
api_router.include_router(kpi_chien_luoc.router, prefix="/kpi-cl", tags=["kpi-chien-luoc"])
api_router.include_router(kpi_unified.router, prefix="/kpi-unified", tags=["kpi-unified"])
api_router.include_router(ocr.router, prefix="/ocr", tags=["ocr"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(report_templates.router, prefix="/report-templates", tags=["report-templates"])
api_router.include_router(gsheet_sync.router, prefix="/sync", tags=["sync"])
api_router.include_router(zalo.router, prefix="/zalo", tags=["zalo"])
api_router.include_router(strategic.router, prefix="/strategic", tags=["strategic"])
api_router.include_router(ws.router, tags=["websocket"])
