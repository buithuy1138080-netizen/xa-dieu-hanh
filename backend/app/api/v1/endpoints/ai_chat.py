"""AI Chat endpoint — conversational interface for IOC data.

Rate limiting: 30 requests/minute per user.
Auth: All endpoints require valid Bearer token.
Permissions: All authenticated roles can chat.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, get_db
from app.models.ai_chat import AiChatMessage, AiChatSession
from app.models.user import User
from app.schemas.ai_chat import (
    ChatMessageIn, ChatMessageOut, ChatResponse,
    ChatSessionDetail, ChatSessionOut, SessionListResponse,
)
from app.services import ai_assistant_service

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Rate limiting (simple per-session counter via module-level dict) ──────────
# For production, replace with Redis-backed slowapi limiter.

_rate_counters: dict[int, list[float]] = {}
_RATE_LIMIT = 30       # requests per window
_RATE_WINDOW = 60.0    # seconds


def _check_rate_limit(user_id: int) -> None:
    import time
    now = time.monotonic()
    window = _rate_counters.setdefault(user_id, [])
    # Drop entries older than window
    _rate_counters[user_id] = [t for t in window if now - t < _RATE_WINDOW]
    if len(_rate_counters[user_id]) >= _RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Vượt giới hạn {_RATE_LIMIT} yêu cầu/{int(_RATE_WINDOW)}s. Vui lòng chờ.",
        )
    _rate_counters[user_id].append(now)


# ── POST /ai-chat/chat ────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def send_message(
    body: ChatMessageIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message to the AI assistant and receive a response.

    - Creates a new session if `session_id` is None.
    - Rate limited to 30 requests/minute per user.
    """
    _check_rate_limit(current_user.id)

    from app.core.config import settings
    if not settings.GEMINI_API_KEY and not settings.GROQ_API_KEY:
        raise HTTPException(503, "AI Assistant chưa được cấu hình (thiếu GEMINI_API_KEY hoặc GROQ_API_KEY)")

    # ── Get or create session ─────────────────────────────────────────────
    if body.session_id:
        session = await db.get(AiChatSession, body.session_id)
        if not session or session.user_id != current_user.id:
            raise HTTPException(404, "Phiên hội thoại không tồn tại")
    else:
        session = AiChatSession(
            user_id=current_user.id,
            title=ai_assistant_service.auto_title(body.content),
        )
        db.add(session)
        await db.flush()

    # ── Load history ──────────────────────────────────────────────────────
    history = await ai_assistant_service.get_session_history(session.id, db)

    # ── Save user message ─────────────────────────────────────────────────
    user_msg = AiChatMessage(
        session_id=session.id,
        role="user",
        content=body.content,
    )
    db.add(user_msg)
    await db.flush()

    # ── Call AI ───────────────────────────────────────────────────────────
    try:
        reply, tools_used, in_tok, out_tok = await ai_assistant_service.chat(
            user_message=body.content,
            history=history,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        logger.exception("AI chat error for user=%s session=%s", current_user.id, session.id)
        raise HTTPException(500, f"Lỗi AI: {exc}")

    # ── Save assistant message ────────────────────────────────────────────
    ai_msg = AiChatMessage(
        session_id=session.id,
        role="assistant",
        content=reply,
        tools_used=json.dumps(tools_used, ensure_ascii=False) if tools_used else None,
        input_tokens=in_tok,
        output_tokens=out_tok,
    )
    db.add(ai_msg)

    # Update session timestamp + auto-title on first exchange
    session.updated_at = datetime.now(timezone.utc)
    if not session.title and history:
        session.title = ai_assistant_service.auto_title(body.content)

    await db.commit()
    await db.refresh(ai_msg)

    return ChatResponse(
        session_id=session.id,
        message=ChatMessageOut.model_validate(ai_msg),
        tool_results={"tools_called": tools_used},
    )


# ── GET /ai-chat/sessions ────────────────────────────────────────────────────

@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List user's chat sessions, newest first."""
    from sqlalchemy import func
    total = (await db.execute(
        select(func.count()).select_from(AiChatSession)
        .where(AiChatSession.user_id == current_user.id)
    )).scalar_one()

    rows = (await db.execute(
        select(AiChatSession)
        .where(AiChatSession.user_id == current_user.id)
        .order_by(desc(AiChatSession.updated_at))
        .offset(skip).limit(limit)
    )).scalars().all()

    return SessionListResponse(
        total=total,
        items=[ChatSessionOut.model_validate(r) for r in rows],
    )


# ── GET /ai-chat/sessions/{id} ───────────────────────────────────────────────

@router.get("/sessions/{session_id}", response_model=ChatSessionDetail)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full message history for a session."""
    result = await db.execute(
        select(AiChatSession)
        .options(selectinload(AiChatSession.messages))
        .where(AiChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session or session.user_id != current_user.id:
        raise HTTPException(404, "Phiên hội thoại không tồn tại")
    return session


# ── DELETE /ai-chat/sessions/{id} ───────────────────────────────────────────

@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a chat session and all its messages."""
    session = await db.get(AiChatSession, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(404, "Phiên hội thoại không tồn tại")
    await db.delete(session)
    await db.commit()


# ── GET /ai-chat/status ──────────────────────────────────────────────────────

@router.get("/status")
async def ai_status(_: User = Depends(get_current_user)):
    """Check if AI assistant is configured and ready."""
    from app.core.config import settings
    if settings.GROQ_API_KEY:
        provider = "groq"
        model = settings.GROQ_MODEL
        ready = True
    else:
        provider = "gemini"
        model = settings.GEMINI_MODEL
        ready = bool(settings.GEMINI_API_KEY)
    return {
        "ready": ready,
        "provider": provider,
        "model": model,
        "tools": 14,
        "configured": ready,
    }
