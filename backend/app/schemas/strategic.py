from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, field_validator


class UserMin(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    username: str
    full_name: str | None = None


class DeptMin(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    name: str
    short_name: str | None = None


class StaffMin(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    full_name: str
    position: str | None = None
    employee_code: str | None = None
    department_id: int | None = None


# ─── StrategicProject ────────────────────────────────────────────────────────

class StrategicProjectCreate(BaseModel):
    project_code: str | None = None
    project_name: str
    project_type: str = "project"
    program_id: int | None = None
    nghi_quyet_id: int | None = None
    source_document_id: int | None = None
    muc_tieu_id: int | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    project_status: str = "planning"
    priority_level: str = "medium"
    progress_percent: int = 0
    responsible_department_id: int | None = None
    coordinating_department_ids: list[int] | None = None
    project_manager_id: int | None = None
    project_manager_staff_id: int | None = None


class StrategicProjectUpdate(BaseModel):
    project_code: str | None = None
    project_name: str | None = None
    project_type: str | None = None
    program_id: int | None = None
    nghi_quyet_id: int | None = None
    source_document_id: int | None = None
    muc_tieu_id: int | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    project_status: str | None = None
    priority_level: str | None = None
    progress_percent: int | None = None
    responsible_department_id: int | None = None
    coordinating_department_ids: list[int] | None = None
    project_manager_id: int | None = None
    project_manager_staff_id: int | None = None


class DocMin(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    title: str
    doc_number: str | None = None


class StrategicProjectOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    project_code: str | None = None
    project_name: str
    project_type: str
    program_id: int | None = None
    nghi_quyet_id: int | None = None
    source_document_id: int | None = None
    source_document: DocMin | None = None
    muc_tieu_id: int | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    project_status: str
    priority_level: str
    progress_percent: int
    responsible_department_id: int | None = None
    coordinating_departments: list[DeptMin] = []
    project_manager_id: int | None = None
    project_manager_staff_id: int | None = None
    responsible_department: DeptMin | None = None
    project_manager: UserMin | None = None
    project_manager_staff: StaffMin | None = None
    creator: UserMin | None = None
    created_at: datetime
    updated_at: datetime


class StrategicProjectList(BaseModel):
    model_config = {"from_attributes": True}
    total: int
    items: list[StrategicProjectOut]


# ─── BudgetPlan ──────────────────────────────────────────────────────────────

class BudgetPlanCreate(BaseModel):
    budget_code: str | None = None
    project_id: int
    fiscal_year: int
    total_budget: float = 0.0
    allocated_budget: float = 0.0
    spent_budget: float = 0.0
    budget_status: str = "draft"
    note: str | None = None


class BudgetPlanUpdate(BaseModel):
    budget_code: str | None = None
    fiscal_year: int | None = None
    total_budget: float | None = None
    allocated_budget: float | None = None
    spent_budget: float | None = None
    budget_status: str | None = None
    note: str | None = None


class BudgetPlanOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    budget_code: str | None = None
    project_id: int
    fiscal_year: int
    total_budget: float
    allocated_budget: float
    spent_budget: float
    remaining_budget: float
    budget_status: str
    note: str | None = None
    creator: UserMin | None = None
    created_at: datetime
    updated_at: datetime


class BudgetPlanList(BaseModel):
    model_config = {"from_attributes": True}
    total: int
    items: list[BudgetPlanOut]


# ─── FundingSource ───────────────────────────────────────────────────────────

class FundingSourceCreate(BaseModel):
    budget_plan_id: int
    funding_source_name: str
    funding_type: str = "ngan_sach_xa"
    funding_amount: float = 0.0
    funding_year: int | None = None
    note: str | None = None


class FundingSourceUpdate(BaseModel):
    funding_source_name: str | None = None
    funding_type: str | None = None
    funding_amount: float | None = None
    funding_year: int | None = None
    note: str | None = None


class FundingSourceOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    budget_plan_id: int
    funding_source_name: str
    funding_type: str
    funding_amount: float
    funding_year: int | None = None
    note: str | None = None
    created_at: datetime


class FundingSourceList(BaseModel):
    model_config = {"from_attributes": True}
    total: int
    items: list[FundingSourceOut]


# ─── Disbursement ────────────────────────────────────────────────────────────

class DisbursementCreate(BaseModel):
    disbursement_code: str | None = None
    budget_plan_id: int
    disbursement_date: date
    disbursement_amount: float
    evidence_file: str | None = None
    note: str | None = None


class DisbursementUpdate(BaseModel):
    disbursement_code: str | None = None
    disbursement_date: date | None = None
    disbursement_amount: float | None = None
    evidence_file: str | None = None
    note: str | None = None


class DisbursementOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    disbursement_code: str | None = None
    budget_plan_id: int
    disbursement_date: date
    disbursement_amount: float
    evidence_file: str | None = None
    note: str | None = None
    creator: UserMin | None = None
    created_at: datetime


class DisbursementList(BaseModel):
    model_config = {"from_attributes": True}
    total: int
    items: list[DisbursementOut]


# ─── ProjectTaskLink ─────────────────────────────────────────────────────────

class ProjectTaskLinkCreate(BaseModel):
    project_id: int
    task_id: int


class ProjectTaskLinkOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    project_id: int
    task_id: int
    created_at: datetime


# ─── Dashboard / Stats ───────────────────────────────────────────────────────

class StrategicDashboardStats(BaseModel):
    total_projects: int
    active_projects: int
    completed_projects: int
    on_hold_projects: int
    planning_projects: int
    total_budget: float
    total_allocated: float
    total_spent: float
    total_remaining: float
    disbursement_rate: float        # spent / total_budget * 100
    avg_progress: float
    overdue_projects: int
    by_status: dict[str, int]
    by_type: dict[str, int]
    by_priority: dict[str, int]
    top_slow_projects: list[dict]   # projects with low progress near deadline
