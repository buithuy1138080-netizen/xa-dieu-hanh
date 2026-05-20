from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class OcrDocumentList(BaseModel):
    id: int
    filename: str
    file_type: str
    file_size: int
    page_count: int
    status: str
    error_msg: str | None = None
    document_id: int | None = None
    linked_task_ids: list[int] = []
    created_at: datetime
    processed_at: datetime | None = None
    confirmed_at: datetime | None = None

    model_config = {"from_attributes": True}


class OcrDocumentRead(OcrDocumentList):
    ocr_text: str | None = None
    ai_result: dict | None = None
    created_by: int

    model_config = {"from_attributes": True}


class OcrUpdateAiResult(BaseModel):
    """User edits the AI-extracted data before confirming."""
    ai_result: dict


class OcrConfirmRequest(BaseModel):
    """Final confirmation — creates Document + Tasks in the system."""
    ai_result: dict
    create_document: bool = True
    create_tasks: bool = True
    selected_task_indices: list[int] = []  # indices into ai_result["nhiem_vu"]


class OcrConfirmResult(BaseModel):
    document_id: int | None = None
    task_ids: list[int] = []
    message: str
