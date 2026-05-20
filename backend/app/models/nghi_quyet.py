from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.staff import Staff
    from app.models.user import User


class NghiQuyet(Base):
    __tablename__ = "nghi_quyet"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ma_nghi_quyet: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ten: Mapped[str] = mapped_column(String(500), nullable=False)
    mo_ta: Mapped[str | None] = mapped_column(Text, nullable=True)
    loai: Mapped[str] = mapped_column(String(50), nullable=False, default="nghi_quyet")
    nam_bat_dau: Mapped[int] = mapped_column(Integer, nullable=False)
    nam_ket_thuc: Mapped[int] = mapped_column(Integer, nullable=False)
    ngay_ban_hanh: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])
    muc_tieu: Mapped[list[MucTieuNQ]] = relationship(
        "MucTieuNQ",
        back_populates="nghi_quyet",
        cascade="all, delete-orphan",
        order_by="MucTieuNQ.thu_tu",
    )


class MucTieuNQ(Base):
    __tablename__ = "muc_tieu_nq"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nghi_quyet_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("nghi_quyet.id", ondelete="CASCADE"), nullable=False, index=True
    )
    muc_tieu_cha_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("muc_tieu_nq.id", ondelete="SET NULL"), nullable=True
    )
    ma_chi_tieu: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ten: Mapped[str] = mapped_column(String(500), nullable=False)
    mo_ta: Mapped[str | None] = mapped_column(Text, nullable=True)
    loai_chi_tieu: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cap_do: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    gia_tri_muc_tieu: Mapped[float | None] = mapped_column(Float, nullable=True)
    don_vi_do: Mapped[str | None] = mapped_column(String(50), nullable=True)
    don_vi_phu_trach_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    can_bo_theo_doi_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True
    )
    nam_hoan_thanh: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    thu_tu: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ghi_chu: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    nghi_quyet: Mapped[NghiQuyet] = relationship("NghiQuyet", back_populates="muc_tieu")
    cha: Mapped[MucTieuNQ | None] = relationship(
        "MucTieuNQ",
        remote_side="MucTieuNQ.id",
        foreign_keys=[muc_tieu_cha_id],
        back_populates="con",
    )
    con: Mapped[list[MucTieuNQ]] = relationship(
        "MucTieuNQ",
        foreign_keys=[muc_tieu_cha_id],
        back_populates="cha",
        order_by="MucTieuNQ.thu_tu",
    )
    don_vi_phu_trach: Mapped[Department | None] = relationship(
        "Department", foreign_keys=[don_vi_phu_trach_id]
    )
    can_bo_theo_doi: Mapped[Staff | None] = relationship(
        "Staff", foreign_keys=[can_bo_theo_doi_id]
    )
    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])
    theo_doi: Mapped[list[BangTheoDoi]] = relationship(
        "BangTheoDoi",
        back_populates="chi_tieu",
        cascade="all, delete-orphan",
        order_by="BangTheoDoi.created_at.desc()",
    )
    lien_ket: Mapped[list[NQLienKetCongViec]] = relationship(
        "NQLienKetCongViec",
        back_populates="chi_tieu",
        cascade="all, delete-orphan",
    )


class BangTheoDoi(Base):
    __tablename__ = "bang_theo_doi_chi_tieu"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    chi_tieu_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("muc_tieu_nq.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gia_tri_thuc_te: Mapped[float] = mapped_column(Float, nullable=False)
    ghi_chu: Mapped[str | None] = mapped_column(Text, nullable=True)
    thang: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quy: Mapped[int | None] = mapped_column(Integer, nullable=True)
    nam: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    nguoi_cap_nhat_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    chi_tieu: Mapped[MucTieuNQ] = relationship("MucTieuNQ", back_populates="theo_doi")
    nguoi_cap_nhat: Mapped[User] = relationship("User", foreign_keys=[nguoi_cap_nhat_id])


class NQLienKetCongViec(Base):
    __tablename__ = "nq_lien_ket_cong_viec"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    chi_tieu_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("muc_tieu_nq.id", ondelete="CASCADE"), nullable=False, index=True
    )
    loai_cong_viec: Mapped[str] = mapped_column(String(20), nullable=False)
    cong_viec_id: Mapped[int] = mapped_column(Integer, nullable=False)
    ghi_chu: Mapped[str | None] = mapped_column(Text, nullable=True)
    nguoi_lien_ket_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    chi_tieu: Mapped[MucTieuNQ] = relationship("MucTieuNQ", back_populates="lien_ket")
    nguoi_lien_ket: Mapped[User] = relationship("User", foreign_keys=[nguoi_lien_ket_id])
