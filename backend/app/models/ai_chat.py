"""AI Chat models — session + message history."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AiChatSession(Base):
    __tablename__ = "ai_chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    messages: Mapped[list[AiChatMessage]] = relationship(
        "AiChatMessage", back_populates="session", cascade="all, delete-orphan",
        order_by="AiChatMessage.id",
    )


class AiChatMessage(Base):
    __tablename__ = "ai_chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("ai_chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "user" | "assistant" | "tool"
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # which tools were called (JSON list of tool names), nullable
    tools_used: Mapped[str | None] = mapped_column(Text, nullable=True)
    # token count for cost tracking
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped[AiChatSession] = relationship("AiChatSession", back_populates="messages")
