"""
Xóa mềm task is_project=True theo tên (soft delete).
Chạy: docker compose exec backend python scripts/delete_project_by_title.py "Tên dự án"
"""

import asyncio
import sys
from datetime import datetime, timezone

sys.path.insert(0, '/app')

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.task import Task


async def main():
    if len(sys.argv) < 2:
        print("Dùng: python scripts/delete_project_by_title.py 'Tên dự án'")
        return

    keyword = sys.argv[1]

    async with AsyncSessionLocal() as db:
        stmt = select(Task).where(
            Task.is_project == True,
            Task.title.ilike(f"%{keyword}%"),
            Task.deleted_at.is_(None),
        )
        tasks = (await db.execute(stmt)).scalars().all()

        if not tasks:
            print(f"Không tìm thấy dự án nào chứa '{keyword}'")
            return

        for t in tasks:
            print(f"  Xóa [{t.id}] {t.title}")
            t.deleted_at = datetime.now(timezone.utc)

        await db.commit()
        print(f"Đã xóa {len(tasks)} dự án.")


if __name__ == '__main__':
    asyncio.run(main())
