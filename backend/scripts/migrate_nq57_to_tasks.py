"""
migrate_nq57_to_tasks.py
========================
Chuyển dữ liệu nq57_tasks → tasks với program_id được gắn tự động.

Cách chạy:
    cd backend
    .venv/Scripts/python.exe scripts/migrate_nq57_to_tasks.py [--dry-run]

Hành vi:
  - Tìm (hoặc tạo) Program có code='NQ57' và program_type='nghi_quyet'
  - Copy mỗi nq57_task chưa được migrate vào bảng tasks
  - Đánh dấu bằng task_code bắt đầu bằng 'NQ57-MIG-'
  - Gắn program_id vào task mới
  - Không xóa nq57_tasks (giữ lại làm lịch sử)
"""
import asyncio
import sys
from datetime import datetime, timezone

sys.path.insert(0, '.')

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.nq57 import NQ57Task
from app.models.program import Program
from app.models.task import Task
from app.models.user import User

DRY_RUN = '--dry-run' in sys.argv

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def main():
    async with AsyncSessionLocal() as db:
        # 1. Tìm/tạo Program NQ57
        prog = (await db.execute(
            select(Program).where(Program.code == 'NQ57')
        )).scalar_one_or_none()

        if not prog:
            # Tìm admin user để làm created_by
            admin = (await db.execute(
                select(User).where(User.role == 'admin').limit(1)
            )).scalar_one_or_none()
            if not admin:
                print("❌ Không tìm thấy user admin. Vui lòng tạo user admin trước.")
                return

            prog = Program(
                code='NQ57',
                name='Nghị quyết 57-NQ/TW về Khoa học, Công nghệ và Đổi mới sáng tạo',
                short_name='NQ57',
                program_type='nghi_quyet',
                status='active',
                description='Nghị quyết về đột phá phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số quốc gia',
                created_by=admin.id,
            )
            if not DRY_RUN:
                db.add(prog)
                await db.flush()
            print(f"✅ Tạo Program NQ57 (id={prog.id if not DRY_RUN else 'DRY'})")
        else:
            print(f"✅ Dùng Program NQ57 hiện có (id={prog.id})")

        # 2. Load tất cả nq57_tasks
        nq57_tasks = (await db.execute(select(NQ57Task))).scalars().all()
        print(f"\n📋 Tìm thấy {len(nq57_tasks)} nq57_tasks cần migrate")

        # 3. Check tasks đã migrate (có prefix NQ57-MIG-)
        existing_codes = set(
            r[0] for r in (await db.execute(
                select(Task.task_code).where(Task.task_code.like('NQ57-MIG-%'))
            )).all()
        )
        print(f"⏭  Đã migrate trước đó: {len(existing_codes)} tasks")

        # 4. Migrate từng task
        migrated = 0
        skipped  = 0

        for nq in nq57_tasks:
            mig_code = f"NQ57-MIG-{nq.id:04d}"
            if mig_code in existing_codes:
                skipped += 1
                continue

            task = Task(
                task_code=mig_code,
                title=nq.title,
                description=nq.description,
                priority=_map_priority(nq),
                status=_map_status(nq.status),
                progress_percent=nq.progress or 0,
                start_date=nq.start_date,
                due_date=datetime(nq.deadline.year, nq.deadline.month, nq.deadline.day,
                                  23, 59, 59, tzinfo=timezone.utc) if nq.deadline else None,
                program_id=prog.id,
                assignee_id=nq.responsible_user_id,
                assignee_staff_id=nq.responsible_staff_id,
                lead_department_id=nq.responsible_department_id,
                created_by=nq.created_by,
                created_at=nq.created_at,
                completion_note=nq.target,
            )

            if not DRY_RUN:
                db.add(task)
            migrated += 1
            print(f"  → {mig_code}: {nq.title[:60]}")

        if not DRY_RUN and migrated > 0:
            await db.commit()

        print(f"\n{'[DRY RUN] ' if DRY_RUN else ''}✅ Migrate xong: {migrated} tasks | Bỏ qua: {skipped}")
        print("💡 nq57_tasks gốc được giữ nguyên (không xóa)")


def _map_status(nq_status: str) -> str:
    return {
        'pending':     'pending',
        'in_progress': 'in_progress',
        'completed':   'completed',
        'delayed':     'in_progress',
    }.get(nq_status, 'pending')


def _map_priority(nq: NQ57Task) -> str:
    if nq.deadline:
        from datetime import date
        days = (nq.deadline - date.today()).days
        if days < 0:   return 'urgent'
        if days < 7:   return 'high'
        if days < 30:  return 'medium'
    return 'low'


if __name__ == '__main__':
    asyncio.run(main())
