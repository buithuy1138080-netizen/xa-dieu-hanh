from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    meeting_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    location: Mapped[str | None] = mapped_column(String(300))
    chair: Mapped[str | None] = mapped_column(String(200))
    agenda: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    files: Mapped[list["MeetingFile"]] = relationship("MeetingFile", back_populates="meeting", cascade="all, delete-orphan")
    participants: Mapped[list["MeetingParticipant"]] = relationship("MeetingParticipant", back_populates="meeting", cascade="all, delete-orphan")


class MeetingFile(Base):
    __tablename__ = "meeting_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    file_name: Mapped[str] = mapped_column(String(300))
    file_path: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    file_mime: Mapped[str | None] = mapped_column(String(100))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    meeting: Mapped["Meeting"] = relationship("Meeting", back_populates="files")


class MeetingParticipant(Base):
    __tablename__ = "meeting_participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))
    name: Mapped[str | None] = mapped_column(String(200))

    meeting: Mapped["Meeting"] = relationship("Meeting", back_populates="participants")
    staff: Mapped["Staff | None"] = relationship("Staff")


from app.models.staff import Staff  # noqa: E402
