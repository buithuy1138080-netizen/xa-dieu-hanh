import time
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin_or_leader
from app.models.department import Department
from app.models.staff import Staff
from app.models.task import Task
from app.models.user import User

router = APIRouter()

# ── In-memory cache ───────────────────────────────────────────────────────────
_DEPT_CACHE: dict = {"data": None, "ts": 0.0}
_DEPT_TTL = 600  # 10 minutes


def _invalidate_dept_cache() -> None:
    _DEPT_CACHE["ts"] = 0.0

# ─── Schemas ──────────────────────────────────────────────────────────────────

class DeptBase(BaseModel):
    name: str
    code: str | None = None
    short_name: str | None = None
    parent_id: int | None = None
    dept_type: str = "unit"
    sort_order: int = 0
    description: str | None = None
    is_active: bool = True


class DeptCreate(DeptBase):
    pass


class DeptUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    short_name: str | None = None
    parent_id: int | None = None
    dept_type: str | None = None
    sort_order: int | None = None
    description: str | None = None
    is_active: bool | None = None


class DeptRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    code: str | None
    name: str
    short_name: str | None
    parent_id: int | None
    dept_type: str
    is_active: bool
    sort_order: int
    description: str | None
    staff_count: int = 0


class DeptTree(DeptRead):
    children: list["DeptTree"] = []


# ─── Seed data ────────────────────────────────────────────────────────────────

DEFAULT_DEPARTMENTS = [
    {"code": "VPD",   "name": "Văn phòng Đảng",                        "short_name": "VP Đảng",    "sort_order": 1},
    {"code": "BXD",   "name": "Ban xây dựng",                           "short_name": "Ban XD",     "sort_order": 2},
    {"code": "UBKT",  "name": "Ủy ban kiểm tra",                        "short_name": "UBKT",       "sort_order": 3},
    {"code": "UBMT",  "name": "Ủy ban Mặt trận Tổ quốc",               "short_name": "UBMTTQ",     "sort_order": 4},
    {"code": "VPHD",  "name": "Văn phòng HĐND-UBND",                    "short_name": "VP HĐND",    "sort_order": 5},
    {"code": "PVH",   "name": "Phòng Văn hóa",                          "short_name": "P. Văn hóa", "sort_order": 6},
    {"code": "PKT",   "name": "Phòng Kinh tế",                          "short_name": "P. Kinh tế", "sort_order": 7},
    {"code": "TTPHC", "name": "Trung tâm Phục vụ Hành chính công",      "short_name": "TT PHCC",    "sort_order": 8},
    {"code": "TTDV",  "name": "Trung tâm Dịch vụ tổng hợp",            "short_name": "TT DVTH",    "sort_order": 9},
    {"code": "BQLDTC","name": "Ban quản lý DT và Chợ VH Bắc Hà",       "short_name": "BQL DT&Chợ", "sort_order": 10},
    {"code": "TYT",   "name": "Trung tâm y tế xã",                      "short_name": "TT Y tế",    "sort_order": 11},
    {"code": "BQLDA", "name": "Ban QLDA Đầu tư XD KV Bắc Hà",          "short_name": "BQL DA",     "sort_order": 12},
    {"code": "CAX",   "name": "Công an xã Bắc Hà",                      "short_name": "Công an xã", "sort_order": 13},
]


async def seed_departments(db: AsyncSession) -> None:
    count = (await db.execute(select(func.count()).select_from(Department))).scalar_one()
    if count > 0:
        return
    for d in DEFAULT_DEPARTMENTS:
        db.add(Department(dept_type="unit", is_active=True, **d))
    await db.commit()


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, dept_id: int) -> Department:
    d = (await db.execute(select(Department).where(Department.id == dept_id))).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Không tìm thấy đơn vị")
    return d


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DeptRead])
async def list_departments(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # Serve from cache (active_only=False only — filtered list skips cache)
    now = time.monotonic()
    if not active_only and _DEPT_CACHE["data"] and (now - _DEPT_CACHE["ts"]) < _DEPT_TTL:
        return _DEPT_CACHE["data"]

    await seed_departments(db)
    stmt = select(Department).order_by(Department.sort_order, Department.name)
    if active_only:
        stmt = stmt.where(Department.is_active.is_(True))
    depts = (await db.execute(stmt)).scalars().all()

    from sqlalchemy import func as sa_func
    from app.models.staff import Staff
    counts_raw = (await db.execute(
        select(Staff.department_id, sa_func.count(Staff.id))
        .where(Staff.is_active.is_(True))
        .group_by(Staff.department_id)
    )).all()
    counts = {row[0]: row[1] for row in counts_raw}

    result = []
    for d in depts:
        r = DeptRead.model_validate(d)
        r.staff_count = counts.get(d.id, 0)
        result.append(r)

    if not active_only:
        _DEPT_CACHE["data"] = result
        _DEPT_CACHE["ts"] = now
    return result


@router.get("/tree", response_model=list[DeptTree])
async def get_department_tree(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await seed_departments(db)
    stmt = select(Department).where(Department.is_active.is_(True)).order_by(Department.sort_order, Department.name)
    depts = (await db.execute(stmt)).scalars().all()
    dept_map: dict[int, DeptTree] = {}
    for d in depts:
        dept_map[d.id] = DeptTree(
            id=d.id, code=d.code, name=d.name, short_name=d.short_name,
            parent_id=d.parent_id, dept_type=d.dept_type, is_active=d.is_active,
            sort_order=d.sort_order, description=d.description,
        )
    roots: list[DeptTree] = []
    for d in depts:
        node = dept_map[d.id]
        if d.parent_id and d.parent_id in dept_map:
            dept_map[d.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


@router.post("", response_model=DeptRead, status_code=status.HTTP_201_CREATED)
async def create_department(
    body: DeptCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin_or_leader),
):
    d = Department(**body.model_dump())
    db.add(d)
    await db.commit()
    await db.refresh(d)
    _invalidate_dept_cache()
    return DeptRead.model_validate(d)


@router.get("/{dept_id}", response_model=DeptRead)
async def get_department(
    dept_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return DeptRead.model_validate(await _get_or_404(db, dept_id))


@router.put("/{dept_id}", response_model=DeptRead)
async def update_department(
    dept_id: int,
    body: DeptUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin_or_leader),
):
    d = await _get_or_404(db, dept_id)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(d, k, v)
    await db.commit()
    await db.refresh(d)
    _invalidate_dept_cache()
    return DeptRead.model_validate(d)


@router.delete("/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_department(
    dept_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin_or_leader),
):
    d = await _get_or_404(db, dept_id)

    staff_count = (
        await db.execute(
            select(func.count()).select_from(Staff).where(
                Staff.department_id == dept_id,
                Staff.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one()
    if staff_count > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Không thể xóa: phòng ban có {staff_count} nhân sự đang hoạt động",
        )

    task_count = (
        await db.execute(
            select(func.count()).select_from(Task).where(
                Task.lead_department_id == dept_id,
                Task.deleted_at.is_(None),
                Task.status.notin_(["completed", "cancelled"]),
            )
        )
    ).scalar_one()
    if task_count > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Không thể xóa: phòng ban có {task_count} nhiệm vụ đang xử lý",
        )

    await db.delete(d)
    await db.commit()
    _invalidate_dept_cache()
