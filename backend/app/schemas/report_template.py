from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, field_validator

TEMPLATE_CATEGORIES = {
    "nq57":      "Báo cáo NQ57",
    "weekly":    "Báo cáo tuần",
    "monthly":   "Báo cáo tháng",
    "directive": "Báo cáo chỉ đạo",
    "kpi":       "Báo cáo KPI",
    "custom":    "Mẫu tùy chỉnh",
}


class ReportTemplateRead(BaseModel):
    id: int
    name: str
    category: str
    description: str | None = None
    file_ext: str
    file_size: int | None = None
    variables: list[str] = []
    list_variables: list[str] = []
    version: int
    is_active: bool
    created_by: int
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, obj):
        return cls(
            id=obj.id,
            name=obj.name,
            category=obj.category,
            description=obj.description,
            file_ext=obj.file_ext,
            file_size=obj.file_size,
            variables=obj.variables_json or [],
            list_variables=obj.list_variables_json or [],
            version=obj.version,
            is_active=obj.is_active,
            created_by=obj.created_by,
            created_at=obj.created_at,
            updated_at=obj.updated_at,
        )


class ReportTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class RenderRequest(BaseModel):
    period_from: str   # YYYY-MM-DD
    period_to: str     # YYYY-MM-DD
    format: str = "xlsx"   # xlsx | docx | pdf

    @field_validator("format")
    @classmethod
    def check_format(cls, v: str) -> str:
        if v not in ("xlsx", "docx", "pdf"):
            raise ValueError("format phải là xlsx, docx hoặc pdf")
        return v


class VariableInfo(BaseModel):
    name: str
    description: str
    example: str


class VariableCatalog(BaseModel):
    scalars: list[VariableInfo]
    lists: list[VariableInfo]
