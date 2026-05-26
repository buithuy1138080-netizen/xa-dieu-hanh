from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.meeting import Meeting, MeetingFile

router = APIRouter()


@router.get("/meetings")
async def public_list_meetings(
    search: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
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
                "file_count": len(m.files),
                "participant_count": len(m.participants),
            }
            for m in items
        ],
    }


@router.get("/meetings/{meeting_id}")
async def public_get_meeting(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
):
    q = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.files), selectinload(Meeting.participants))
        .where(Meeting.id == meeting_id)
    )
    m = q.scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Không tìm thấy cuộc họp")
    return {
        "id": m.id,
        "title": m.title,
        "meeting_date": m.meeting_date,
        "location": m.location,
        "chair": m.chair,
        "agenda": m.agenda,
        "created_at": m.created_at,
        "files": [
            {
                "id": f.id,
                "file_name": f.file_name,
                "file_size": f.file_size,
                "file_mime": f.file_mime,
                "uploaded_at": f.uploaded_at,
            }
            for f in m.files
        ],
        "participants": [
            {"id": p.id, "name": p.name}
            for p in m.participants
        ],
    }


@router.get("/meetings/{meeting_id}/files/{file_id}")
async def public_download_file(
    meeting_id: int,
    file_id: int,
    db: AsyncSession = Depends(get_db),
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
    return FileResponse(
        path=str(path),
        filename=mf.file_name,
        media_type=mime,
        headers={"Content-Disposition": f'{disposition}; filename="{mf.file_name}"'},
    )
