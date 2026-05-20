from datetime import date, datetime
from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class KpiCL(Base):
    __tablename__ = "kpi_chien_luoc"

    id:                  Mapped[int]          = mapped_column(primary_key=True)
    ma_kpi:              Mapped[str | None]    = mapped_column(String(50))
    ten:                 Mapped[str]           = mapped_column(String(300))
    mo_ta:               Mapped[str | None]    = mapped_column(Text)
    loai_kpi:            Mapped[str]           = mapped_column(String(20),  default="nam")
    danh_muc:            Mapped[str | None]    = mapped_column(String(100))
    gia_tri_muc_tieu:    Mapped[float]         = mapped_column(Float,       default=100.0)
    gia_tri_thuc_te:     Mapped[float]         = mapped_column(Float,       default=0.0)
    pct_hoan_thanh:      Mapped[float]         = mapped_column(Float,       default=0.0)
    don_vi_do:           Mapped[str | None]    = mapped_column(String(50))
    trang_thai:          Mapped[str]           = mapped_column(String(30),  default="Chưa bắt đầu")
    quy:                 Mapped[int | None]    = mapped_column(Integer)
    nam:                 Mapped[int]           = mapped_column(Integer)
    ten_nhiem_ky:        Mapped[str | None]    = mapped_column(String(20))
    han_hoan_thanh:      Mapped[date | None]   = mapped_column(Date)
    don_vi_phu_trach_id: Mapped[int | None]    = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    nguoi_theo_doi_id:   Mapped[int | None]    = mapped_column(ForeignKey("users.id",       ondelete="SET NULL"))
    created_by:          Mapped[int]           = mapped_column(ForeignKey("users.id",       ondelete="RESTRICT"))
    # Soft links (no FK constraint — avoids cross-module coupling)
    van_ban_id:          Mapped[int | None]    = mapped_column(Integer)
    nhiem_vu_id:         Mapped[int | None]    = mapped_column(Integer)
    chi_tieu_nq_id:      Mapped[int | None]    = mapped_column(Integer)
    created_at:          Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:          Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    don_vi_phu_trach = relationship("Department", foreign_keys=[don_vi_phu_trach_id])
    nguoi_theo_doi   = relationship("User", foreign_keys=[nguoi_theo_doi_id])
    creator          = relationship("User", foreign_keys=[created_by])
    tien_do_entries: Mapped[list["KpiCLTienDo"]] = relationship(
        back_populates="kpi", cascade="all, delete-orphan", order_by="KpiCLTienDo.created_at.desc()"
    )


class KpiCLTienDo(Base):
    __tablename__ = "kpi_cl_tien_do"

    id:               Mapped[int]         = mapped_column(primary_key=True)
    kpi_id:           Mapped[int]         = mapped_column(ForeignKey("kpi_chien_luoc.id", ondelete="CASCADE"))
    gia_tri:          Mapped[float]       = mapped_column(Float)
    ghi_chu:          Mapped[str | None]  = mapped_column(Text)
    quy:              Mapped[int | None]  = mapped_column(Integer)
    nam:              Mapped[int]         = mapped_column(Integer)
    nguoi_cap_nhat_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at:       Mapped[datetime]    = mapped_column(DateTime(timezone=True), server_default=func.now())

    kpi             = relationship("KpiCL", back_populates="tien_do_entries")
    nguoi_cap_nhat  = relationship("User", foreign_keys=[nguoi_cap_nhat_id])
