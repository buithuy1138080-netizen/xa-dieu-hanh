"""Pydantic schemas for AI Chat."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ChatMessageIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    session_id: int | None = None  # None → create new session


class ChatMessageOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    session_id: int
    role: str
    content: str
    tools_used: str | None = None
    input_tokens: int
    output_tokens: int
    created_at: datetime


class ChatSessionOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    title: str | None = None
    created_at: datetime
    updated_at: datetime


class ChatSessionDetail(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    title: str | None = None
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageOut] = []


class ChatResponse(BaseModel):
    session_id: int
    message: ChatMessageOut
    # structured data from tool calls (for UI rendering)
    tool_results: dict[str, Any] = {}


class SessionListResponse(BaseModel):
    total: int
    items: list[ChatSessionOut]
