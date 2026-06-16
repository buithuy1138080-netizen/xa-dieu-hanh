"""
Migrate toàn bộ StrategicProject → Task[is_project=True]

Chạy: docker compose exec backend python scripts/migrate_strategic_to_tasks.py

Script idempotent: bỏ qua project đã migrate (kiểm tra theo title + is_project=True).
Budget: lấy từ BudgetPlan, chuyển đổi đồng → triệu đồng (chia 1,000,000).
"""

import asyncio
import sys
from datetime import datetime, timezone

# Phải thêm path trước khi import app
sys.path.insert(0, '/app')

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.strategic import BudgetPlan, StrategicProject
from app.models.task import Task


STATUS_MAP = {
    'planning':  'pending',
    'active':    'in_progress',
    'on_hold':   'pending',
    'completed': 'completed',
    'cancelled': 'cancelled',
}

PRIORITY_MAP = {
    'low':      'low',
    'medium':   'medium',
    'high':     'high',
    'critical': 'urgent',
}


async def main():
    async with AsyncSessionLocal() as db:
        # Lấy toàn bộ strategic projects
        stmt = (
            select(StrategicProject)
            .options(
                selectinload(StrategicProject.budget_plans),
                selectinload(StrategicProject.responsible_department),
            )
            .order_by(StrategicProject.id)
        )
        sp_list = (await db.execute(stmt)).scalars().all()

        if not sp_list:
            print("Không có StrategicProject nào để migrate.")
            return

        # Lấy task_code cao nhất để tránh trùng
        max_code_row = (await db.execute(
            select(func.max(Task.id))
        )).scalar_one_or_none() or 0

        migrated = 0
        skipped = 0

        for sp in sp_list:
            # Kiểm tra đã migrate chưa (theo task_code nếu có, hoặc title)
            check = select(Task).where(
                Task.is_project == True,
                Task.title == sp.project_name,
            )
            existing = (await db.execute(check)).scalar_one_or_none()
            if existing:
                print(f"  SKIP (đã tồn tại): {sp.project_name}")
                skipped += 1
                continue

            # Tính budget từ BudgetPlan, chuyển đồng → triệu đồng
            raw_budget = sum(bp.total_budget for bp in sp.budget_plans) if sp.budget_plans else 0
            raw_spent = sum(bp.spent_budget for bp in sp.budget_plans) if sp.budget_plans else 0
            budget_amount = round(raw_budget / 1_000_000, 2) if raw_budget else None
            budget_disbursed = round(raw_spent / 1_000_000, 2) if raw_spent else None

            # Chuyển end_date (date) → due_date (datetime)
            due_date = None
            if sp.end_date:
                due_date = datetime(
                    sp.end_date.year, sp.end_date.month, sp.end_date.day,
                    23, 59, 59, tzinfo=timezone.utc
                )

            # Map task_code: giữ project_code nếu có
            task_code = sp.project_code if sp.project_code else None

            task = Task(
                title=sp.project_name,
                description=sp.description,
                task_code=task_code,
                status=STATUS_MAP.get(sp.project_status, 'pending'),
                priority=PRIORITY_MAP.get(sp.priority_level, 'medium'),
                is_project=True,
                project_type=sp.project_type or 'project',
                budget_amount=budget_amount,
                budget_disbursed=budget_disbursed,
                progress_percent=sp.progress_percent,
                start_date=sp.start_date,
                due_date=due_date,
                program_id=sp.program_id,
                assignee_id=sp.project_manager_id,
                lead_department_id=sp.responsible_department_id,
                created_by=sp.created_by or 1,
                task_type='regular',
            )
            db.add(task)
            migrated += 1
            print(f"  OK: {sp.project_name} | {sp.project_status} → {task.status} | budget={budget_amount}")

        await db.commit()
        print(f"\nKết quả: migrate {migrated}, bỏ qua {skipped} (đã tồn tại).")
        print("Kiểm tra lại giá trị budget_amount/budget_disbursed sau khi chạy.")


if __name__ == '__main__':
    asyncio.run(main())
