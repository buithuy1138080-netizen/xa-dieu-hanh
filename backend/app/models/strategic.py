from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.document import Document
    from app.models.nghi_quyet import NghiQuyet
    from app.models.program import Program
    from app.models.staff import Staff
    from app.models.task import Task
    from app.models.user import User


class ProjectDepartment(Base):
    """Junction table: many-to-many between StrategicProject and Department."""
    __tablename__ = "project_departments"

    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("strategic_projects.id", ondelete="CASCADE"), primary_key=True
    )
    department_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True
    )


class StrategicProject(Base):
    __tablename__ = "strategic_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_code: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True, index=True)
    project_name: Mapped[str] = mapped_column(String(300), nullable=False, index=True)

    # project/program/plan/digital_transform
    project_type: Mapped[str] = mapped_column(String(30), nullable=False, default="project")

    program_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("programs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    nghi_quyet_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("nghi_quyet.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_document_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    muc_tieu_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # planning/active/on_hold/completed/cancelled
    project_status: Mapped[str] = mapped_column(String(20), nullable=False, default="planning", index=True)
    # low/medium/high/critical
    priority_level: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")

    progress_percent: Mapped[int] = mapped_column(Integer, default=0)

    responsible_department_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )

    project_manager_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    project_manager_staff_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # relationships
    program: Mapped["Program | None"] = relationship("Program", foreign_keys=[program_id])
    nghi_quyet: Mapped["NghiQuyet | None"] = relationship("NghiQuyet", foreign_keys=[nghi_quyet_id])
    source_document: Mapped["Document | None"] = relationship("Document", foreign_keys=[source_document_id])
    responsible_department: Mapped[Department | None] = relationship(
        "Department", foreign_keys=[responsible_department_id]
    )
    coordinating_departments: Mapped[list[Department]] = relationship(
        "Department", secondary="project_departments", lazy="noload"
    )
    project_manager: Mapped[User | None] = relationship("User", foreign_keys=[project_manager_id])
    project_manager_staff: Mapped[Staff | None] = relationship("Staff", foreign_keys=[project_manager_staff_id])
    creator: Mapped[User | None] = relationship("User", foreign_keys=[created_by])
    budget_plans: Mapped[list[BudgetPlan]] = relationship(
        "BudgetPlan", back_populates="project", cascade="all, delete-orphan"
    )
    task_links: Mapped[list[ProjectTaskLink]] = relationship(
        "ProjectTaskLink", back_populates="project", cascade="all, delete-orphan"
    )


class BudgetPlan(Base):
    __tablename__ = "budget_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    budget_code: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True, index=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("strategic_projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    total_budget: Mapped[float] = mapped_column(Float, default=0.0)
    allocated_budget: Mapped[float] = mapped_column(Float, default=0.0)
    spent_budget: Mapped[float] = mapped_column(Float, default=0.0)

    # draft/approved/active/closed/over_budget
    budget_status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped[StrategicProject] = relationship("StrategicProject", back_populates="budget_plans")
    creator: Mapped[User | None] = relationship("User", foreign_keys=[created_by])
    funding_sources: Mapped[list[FundingSource]] = relationship(
        "FundingSource", back_populates="budget_plan", cascade="all, delete-orphan"
    )
    disbursements: Mapped[list[Disbursement]] = relationship(
        "Disbursement", back_populates="budget_plan", cascade="all, delete-orphan"
    )

    @property
    def remaining_budget(self) -> float:
        return self.total_budget - self.spent_budget


class FundingSource(Base):
    __tablename__ = "funding_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    budget_plan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("budget_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    funding_source_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # ngan_sach_tinh/ngan_sach_xa/trung_uong/von_dau_tu/xa_hoi_hoa/tai_tro
    funding_type: Mapped[str] = mapped_column(String(30), nullable=False, default="ngan_sach_xa")
    funding_amount: Mapped[float] = mapped_column(Float, default=0.0)
    funding_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    budget_plan: Mapped[BudgetPlan] = relationship("BudgetPlan", back_populates="funding_sources")
    creator: Mapped[User | None] = relationship("User", foreign_keys=[created_by])


class Disbursement(Base):
    __tablename__ = "disbursements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    disbursement_code: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    budget_plan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("budget_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    disbursement_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    disbursement_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    evidence_file: Mapped[str | None] = mapped_column(String(512), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    budget_plan: Mapped[BudgetPlan] = relationship("BudgetPlan", back_populates="disbursements")
    creator: Mapped[User | None] = relationship("User", foreign_keys=[created_by])


class ProjectTaskLink(Base):
    __tablename__ = "project_task_links"
    __table_args__ = (UniqueConstraint("project_id", "task_id", name="uq_project_task"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("strategic_projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[StrategicProject] = relationship("StrategicProject", back_populates="task_links")
    task: Mapped[Task] = relationship("Task", passive_deletes=True)


class DocumentStrategicProject(Base):
    __tablename__ = "document_strategic_projects"
    __table_args__ = (UniqueConstraint("document_id", "project_id", name="uq_doc_strategic_project"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("strategic_projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    link_type: Mapped[str] = mapped_column(String(30), nullable=False, default="reference")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped["Document"] = relationship("Document", foreign_keys=[document_id])
    project: Mapped[StrategicProject] = relationship("StrategicProject", foreign_keys=[project_id])
    creator: Mapped["User | None"] = relationship("User", foreign_keys=[created_by])
