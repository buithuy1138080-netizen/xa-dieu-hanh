"""
Fix budget_amount cho các task is_project=True bị lưu sai đơn vị (đồng thay vì triệu đồng).

Áp dụng cho project được migrate từ StrategicProject có budget lớn (>= 1,000,000).
Chạy: docker compose exec backend python scripts/fix_budget_units.py
"""

import asyncio
import sys

sys.path.insert(0, '/app')

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.task import Task


async def main():
    async with AsyncSessionLocal() as db:
        stmt = select(Task).where(Task.is_project == True, Task.deleted_at.is_(None))
        tasks = (await db.execute(stmt)).scalars().all()

        fixed = 0
        for t in tasks:
            changes = []

            # Nếu budget_amount >= 1,000,000 → đang lưu theo đồng, cần chia 1,000,000
            if t.budget_amount is not None and t.budget_amount >= 1_000_000:
                old = t.budget_amount
                t.budget_amount = round(old / 1_000_000, 2)
                changes.append(f"budget_amount: {old} → {t.budget_amount} triệu")

            if t.budget_disbursed is not None and t.budget_disbursed >= 1_000_000:
                old = t.budget_disbursed
                t.budget_disbursed = round(old / 1_000_000, 2)
                changes.append(f"budget_disbursed: {old} → {t.budget_disbursed} triệu")

            if changes:
                print(f"  FIX [{t.id}] {t.title}: {', '.join(changes)}")
                fixed += 1

        await db.commit()
        print(f"\nKết quả: đã fix {fixed} dự án.")
        if fixed == 0:
            print("Không có dữ liệu nào cần fix (tất cả budget < 1,000,000 → đã đúng đơn vị triệu).")


if __name__ == '__main__':
    asyncio.run(main())
