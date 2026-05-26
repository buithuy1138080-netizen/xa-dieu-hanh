from pathlib import Path
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin_or_leader
from app.models.meeting import Meeting, MeetingFile, MeetingParticipant
from app.models.user import User
from app.models.staff import Staff

router = APIRouter()

MEETING_UPLOAD_DIR = Path("uploads/meetings")
MEETING_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_EXTS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".png", ".jpg", ".jpeg"}


# ── Schemas ──────────────────────────────────────────────────────────────────

class ParticipantIn(BaseModel):
    staff_id: int | None = None
    name: str | None = None

class MeetingCreate(BaseModel):
    title: str
    meeting_date: datetime
    location: str | None = None
    chair: str | None = None
    agenda: str | None = None
    participant_ids: list[int] = []

class MeetingUpdate(BaseModel):
    title: str | None = None
    meeting_date: datetime | None = None
    location: str | None = None
    chair: str | None = None
    agenda: str | None = None
    participant_ids: list[int] | None = None

class FileOut(BaseModel):
    id: int
    file_name: str
    file_size: int
    file_mime: str | None
    uploaded_at: datetime
    model_config = {"from_attributes": True}

class ParticipantOut(BaseModel):
    id: int
    staff_id: int | None
    name: str | None
    model_config = {"from_attributes": True}

class MeetingOut(BaseModel):
    id: int
    title: str
    meeting_date: datetime
    location: str | None
    chair: str | None
    agenda: str | None
    created_at: datetime
    created_by_id: int | None
    files: list[FileOut] = []
    participants: list[ParticipantOut] = []
    model_config = {"from_attributes": True}

class MeetingListOut(BaseModel):
    id: int
    title: str
    meeting_date: datetime
    location: str | None
    chair: str | None
    created_by_id: int | None
    file_count: int = 0
    participant_count: int = 0
    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _can_manage(user: User, meeting: Meeting) -> bool:
    return user.role in ("admin", "leader") or meeting.created_by_id == user.id


async def _get_or_404(db: AsyncSession, meeting_id: int) -> Meeting:
    q = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.files), selectinload(Meeting.participants))
        .where(Meeting.id == meeting_id)
    )
    m = q.scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Không tìm thấy cuộc họp")
    return m


async def _set_participants(db: AsyncSession, meeting: Meeting, staff_ids: list[int]):
    for p in list(meeting.participants):
        await db.delete(p)
    await db.flush()
    for sid in staff_ids:
        staff = (await db.execute(select(Staff).where(Staff.id == sid))).scalar_one_or_none()
        name = staff.full_name if staff else None
        db.add(MeetingParticipant(meeting_id=meeting.id, staff_id=sid, name=name))


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
@router.get("/", response_model=dict, include_in_schema=False)
async def list_meetings(
    search: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Meeting)
    if search:
        q = q.where(Meeting.title.ilike(f"%{search}%"))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    items = (await db.execute(
        q.options(selectinload(Meeting.files), selectinload(Meeting.participants))
        .order_by(Meeting.meeting_date.desc())
        .offset((page - 1) * size).limit(size)
    )).scalars().all()
    return {
        "total": total,
        "items": [
            {
                "id": m.id,
                "title": m.title,
                "meeting_date": m.meeting_date,
                "location": m.location,
                "chair": m.chair,
                "created_by_id": m.created_by_id,
                "file_count": len(m.files),
                "participant_count": len(m.participants),
            }
            for m in items
        ],
    }


@router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    body: MeetingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = Meeting(
        title=body.title,
        meeting_date=body.meeting_date,
        location=body.location,
        chair=body.chair,
        agenda=body.agenda,
        created_by_id=current_user.id,
    )
    db.add(m)
    await db.flush()
    for sid in body.participant_ids:
        staff = (await db.execute(select(Staff).where(Staff.id == sid))).scalar_one_or_none()
        db.add(MeetingParticipant(meeting_id=m.id, staff_id=sid, name=staff.full_name if staff else None))
    await db.commit()
    return await _get_or_404(db, m.id)


@router.get("/{meeting_id}", response_model=MeetingOut)
async def get_meeting(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_or_404(db, meeting_id)


@router.put("/{meeting_id}", response_model=MeetingOut)
async def update_meeting(
    meeting_id: int,
    body: MeetingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = await _get_or_404(db, meeting_id)
    if not _can_manage(current_user, m):
        raise HTTPException(403, "Bạn không có quyền sửa cuộc họp này")
    if body.title is not None:
        m.title = body.title
    if body.meeting_date is not None:
        m.meeting_date = body.meeting_date
    if body.location is not None:
        m.location = body.location
    if body.chair is not None:
        m.chair = body.chair
    if body.agenda is not None:
        m.agenda = body.agenda
    if body.participant_ids is not None:
        await _set_participants(db, m, body.participant_ids)
    await db.commit()
    return await _get_or_404(db, meeting_id)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = await _get_or_404(db, meeting_id)
    if not _can_manage(current_user, m):
        raise HTTPException(403, "Bạn không có quyền xóa cuộc họp này")
    await db.delete(m)
    await db.commit()


@router.post("/{meeting_id}/files", response_model=FileOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    meeting_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = await _get_or_404(db, meeting_id)
    if not _can_manage(current_user, m):
        raise HTTPException(403, "Bạn không có quyền upload file cho cuộc họp này")
    ext = Path(file.filename or "file").suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, f"Định dạng '{ext}' không được phép")
    dest_dir = MEETING_UPLOAD_DIR / str(meeting_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "file").name
    dest = dest_dir / safe_name
    content = await file.read()
    dest.write_bytes(content)
    mf = MeetingFile(
        meeting_id=meeting_id,
        file_name=safe_name,
        file_path=str(dest),
        file_size=len(content),
        file_mime=file.content_type or "application/octet-stream",
    )
    db.add(mf)
    await db.commit()
    await db.refresh(mf)
    return mf


@router.get("/{meeting_id}/files/{file_id}")
async def download_file(
    meeting_id: int,
    file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    mf = (await db.execute(
        select(MeetingFile).where(MeetingFile.id == file_id, MeetingFile.meeting_id == meeting_id)
    )).scalar_one_or_none()
    if not mf:
        raise HTTPException(404, "Không tìm thấy file")
    path = Path(mf.file_path)
    if not path.exists():
        raise HTTPException(404, "File không tồn tại trên server")
    mime = mf.file_mime or "application/octet-stream"
    disposition = "inline" if mime == "application/pdf" else "attachment"
    encoded = quote(mf.file_name, safe="")
    return FileResponse(
        path=str(path),
        media_type=mime,
        headers={"Content-Disposition": f"{disposition}; filename*=UTF-8''{encoded}"},
    )


@router.delete("/{meeting_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    meeting_id: int,
    file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = await _get_or_404(db, meeting_id)
    if not _can_manage(current_user, m):
        raise HTTPException(403, "Bạn không có quyền xóa file của cuộc họp này")
    mf = (await db.execute(
        select(MeetingFile).where(MeetingFile.id == file_id, MeetingFile.meeting_id == meeting_id)
    )).scalar_one_or_none()
    if not mf:
        raise HTTPException(404, "Không tìm thấy file")
    try:
        Path(mf.file_path).unlink(missing_ok=True)
    except Exception:
        pass
    await db.delete(mf)
    await db.commit()
