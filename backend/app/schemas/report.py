from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


REPORT_TYPES = {
    "monthly":   "Báo cáo tháng",
    "quarterly": "Báo cáo quý",
    "annual":    "Báo cáo năm",
    "kpi":       "Báo cáo KPI",
    "executive": "Báo cáo điều hành lãnh đạo",
    "nq57":      "Báo cáo NQ57",
}


class ReportCreate(BaseModel):
    report_type: str          # monthly/quarterly/annual/kpi/executive/nq57
    period_from: date
    period_to: date


class ReportList(BaseModel):
    id: int
    report_type: str
    title: str
    period_label: str
    period_from: date
    period_to: date
    status: str
    error_msg: str | None = None
    file_path_docx: str | None = None
    file_path_xlsx: str | None = None
    template_id: int | None = None
    created_at: datetime
    generated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ReportRead(ReportList):
    summary_data: dict | None = None
    ai_summary: dict | None = None
    created_by: int

    model_config = {"from_attributes": True}
