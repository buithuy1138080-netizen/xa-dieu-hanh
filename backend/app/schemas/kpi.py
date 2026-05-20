from datetime import date, datetime

from pydantic import BaseModel, model_validator


class UserMin(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    username: str
    full_name: str | None


class DeptMin(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    name: str
    short_name: str | None
    code: str | None


class StaffMin(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    full_name: str
    position: str | None = None
    employee_code: str | None = None
    department_id: int | None = None


# ─── KPI ─────────────────────────────────────────────────────────────────────

class KPICreate(BaseModel):
    code: str | None = None
    title: str
    description: str | None = None
    unit: str | None = None
    category: str | None = None
    target_value: float = 100.0
    current_value: float = 0.0
    period: str = "yearly"
    year: int
    quarter: int | None = None
    month: int | None = None
    status: str = "on_track"
    deadline: date | None = None
    responsible_unit: str | None = None
    responsible_department_id: int | None = None
    responsible_user_id: int | None = None
    responsible_staff_id: int | None = None


class KPIUpdate(BaseModel):
    code: str | None = None
    title: str | None = None
    description: str | None = None
    unit: str | None = None
    category: str | None = None
    target_value: float | None = None
    current_value: float | None = None
    period: str | None = None
    year: int | None = None
    quarter: int | None = None
    month: int | None = None
    status: str | None = None
    deadline: date | None = None
    responsible_unit: str | None = None
    responsible_department_id: int | None = None
    responsible_user_id: int | None = None
    responsible_staff_id: int | None = None


class KPIProgressCreate(BaseModel):
    value: float
    note: str | None = None


class KPIProgressRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    kpi_id: int
    value: float
    note: str | None
    user: UserMin
    recorded_at: datetime


class KPIHistoryRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    action: str
    old_value: float | None
    new_value: float | None
    old_status: str | None
    new_status: str | None
    note: str | None
    user: UserMin
    created_at: datetime


class KPIRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    code: str | None
    title: str
    description: str | None
    unit: str | None
    category: str | None
    target_value: float
    current_value: float
    progress: float
    period: str
    year: int
    quarter: int | None
    month: int | None
    status: str
    deadline: date | None
    responsible_unit: str | None
    responsible_department_id: int | None
    responsible_department: DeptMin | None
    responsible_user: UserMin | None
    responsible_staff: StaffMin | None = None
    creator: UserMin
    created_at: datetime
    updated_at: datetime | None


class KPIReadDetail(KPIRead):
    progress_entries: list[KPIProgressRead] = []
    history: list[KPIHistoryRead] = []


class KPIStats(BaseModel):
    total: int
    on_track: int
    at_risk: int
    behind: int
    completed: int
    avg_progress: float
    overdue: int


# ─── NQ57 ────────────────────────────────────────────────────────────────────

class NQ57TaskCreate(BaseModel):
    code: str | None = None
    title: str
    description: str | None = None
    group: str | None = None
    target: str | None = None
    progress: int = 0
    status: str = "pending"
    start_date: date | None = None
    deadline: date | None = None
    responsible_unit: str | None = None
    responsible_department_id: int | None = None
    responsible_user_id: int | None = None
    kpi_id: int | None = None


class NQ57TaskUpdate(BaseModel):
    code: str | None = None
    title: str | None = None
    description: str | None = None
    group: str | None = None
    target: str | None = None
    progress: int | None = None
    status: str | None = None
    start_date: date | None = None
    deadline: date | None = None
    responsible_unit: str | None = None
    responsible_department_id: int | None = None
    responsible_user_id: int | None = None
    responsible_staff_id: int | None = None
    kpi_id: int | None = None


class NQ57ProgressCreate(BaseModel):
    progress: int
    note: str | None = None


class NQ57ProgressRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    task_id: int
    progress: int
    note: str | None
    user: UserMin
    created_at: datetime


class KPIMin(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    title: str
    progress: float
    status: str


class NQ57TaskRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    code: str | None
    title: str
    description: str | None
    group: str | None
    target: str | None
    progress: int
    status: str
    start_date: date | None
    deadline: date | None
    responsible_unit: str | None
    responsible_department_id: int | None
    responsible_department: DeptMin | None
    responsible_user: UserMin | None
    responsible_staff: StaffMin | None = None
    kpi: KPIMin | None
    creator: UserMin
    created_at: datetime
    updated_at: datetime | None


class NQ57TaskReadDetail(NQ57TaskRead):
    progress_entries: list[NQ57ProgressRead] = []


class NQ57Stats(BaseModel):
    total: int
    pending: int
    in_progress: int
    completed: int
    delayed: int
    avg_progress: float


# ─── Generic ──────────────────────────────────────────────────────────────────

class PaginatedResponse[T](BaseModel):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int
