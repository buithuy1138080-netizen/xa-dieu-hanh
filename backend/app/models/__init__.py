from app.models.user import User  # noqa: F401
from app.models.department import Department  # noqa: F401
from app.models.staff import Staff  # noqa: F401
from app.models.task import Task, TaskComment, TaskAttachment, TaskAuditLog, TaskDepartment  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.document import Document, DocumentComment, DocumentHistory, DocumentTask  # noqa: F401
from app.models.directive import Directive, DirectiveUnit, DirectiveTask, DirectiveComment, DirectiveHistory, DirectiveAttachment  # noqa: F401
from app.models.kpi import KPI, KPIProgress, KPIHistory  # noqa: F401
from app.models.nq57 import NQ57Task, NQ57Progress  # noqa: F401
from app.models.ocr_document import OcrDocument  # noqa: F401
from app.models.report import Report  # noqa: F401
from app.models.gsheet_sync import SyncConfig, SyncLog, SyncConflict  # noqa: F401
from app.models.zalo import ZaloConfig, ZaloTemplate, ZaloLog, ZaloUserLink  # noqa: F401
from app.models.strategic import StrategicProject, BudgetPlan, FundingSource, Disbursement, ProjectTaskLink, ProjectDepartment  # noqa: F401
from app.models.nghi_quyet import NghiQuyet, MucTieuNQ  # noqa: F401
from app.models.kpi_chien_luoc import KpiCL, KpiCLTienDo  # noqa: F401
from app.models.report_template import ReportTemplate  # noqa: F401
from app.models.program import Tag, DocumentTag, Program, DocumentProgram  # noqa: F401
from app.models.evidence import Evidence  # noqa: F401
from app.models.ai_chat import AiChatSession, AiChatMessage  # noqa: F401
from app.models.meeting import Meeting, MeetingFile, MeetingParticipant  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401
