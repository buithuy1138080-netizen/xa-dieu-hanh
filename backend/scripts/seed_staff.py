#!/usr/bin/env python3
"""
seed_staff.py — Import dữ liệu nhân sự mẫu vào hệ thống IOC
Chạy từ thư mục backend: python scripts/seed_staff.py

- Không xóa dữ liệu cũ
- Skip nếu username/email đã tồn tại
- Tạo department nếu chưa có
- Hash password bằng bcrypt
- Liên kết Staff <-> User <-> Department
"""

import asyncio
import sys
import io
from pathlib import Path

# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Add backend root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import logging
import os

# Suppress SQLAlchemy echo logging to avoid cp1252 issues via logging handlers
os.environ.setdefault("ENVIRONMENT", "production")  # suppress echo
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal as async_session_factory
from app.core.security import hash_password
from app.models.department import Department
from app.models.staff import Staff
from app.models.user import User

# ── Role mapping ─────────────────────────────────────────────────────────────
ROLE_MAP: dict[str, str] = {
    "Admin":    "admin",
    "Lãnh đạo": "leader",
    "Quản lý":  "manager",
    "Nhân viên":"staff",
}

# ── Department name → code mapping ───────────────────────────────────────────
DEPT_CODE_MAP: dict[str, str] = {
    "Văn phòng Đảng ủy":                  "VPD",
    "Phòng Văn hóa":                       "PVH",
    "Phòng Kinh tế":                       "PKT",
    "DV004":                               "UBMT",   # Mặt trận Tổ quốc
    "Đảng ủy xã Bắc Hà":                  "DUX",    # sẽ tạo nếu chưa có
    "Ban xây dựng":                        "BXD",
    "Trung tâm Phục vụ Hành chính công":  "TTPHC",
    "Ủy ban kiểm tra":                     "UBKT",
    "Trung tâm Dịch vụ tổng hợp":         "TTDV",
    "Ban QLDA Đầu tư XD KV Bắc Hà":      "BQLDA",
    "UBND xã Bắc Hà":                     "VPHD",
}

# ── Extra departments to create if missing ───────────────────────────────────
EXTRA_DEPTS = [
    {"code": "DUX", "name": "Đảng ủy xã Bắc Hà", "short_name": "Đảng ủy xã", "sort_order": 0},
]

# ── Staff data ────────────────────────────────────────────────────────────────
# Fields: emp_code, username, email, password, role (vi), full_name, position,
#         dept_name, phone
# username=None → only Staff record, no User account (or admin uses existing)
STAFF_DATA = [
    # NS001 — admin user already exists; chỉ cần tạo Staff record
    {
        "emp_code": "NS001",
        "username": "admin",           # user đã tồn tại
        "email": "admin@xadieuhan.gov.vn",
        "password": None,              # không đổi password admin
        "role": "Admin",
        "full_name": "Admin",
        "position": "Quản trị viên",
        "dept_name": None,
        "phone": "815815288",
    },
    # NS002
    {
        "emp_code": "NS002",
        "username": "nhung",
        "email": "nhung@gmail.com",
        "password": "admin124",
        "role": "Quản lý",
        "full_name": "Nguyễn Thị Nhung",
        "position": "Chánh VP Đảng",
        "dept_name": "Văn phòng Đảng ủy",
        "phone": "",
    },
    # NS003
    {
        "emp_code": "NS003",
        "username": "tuan",
        "email": "tuan@gmail.com",
        "password": "admin125",
        "role": "Quản lý",
        "full_name": "Nguyễn Minh Tuấn",
        "position": "Phó chánh VP Đảng",
        "dept_name": "Văn phòng Đảng ủy",
        "phone": "",
    },
    # NS004
    {
        "emp_code": "NS004",
        "username": "quy",
        "email": "quy@gmail.com",
        "password": "admin126",
        "role": "Nhân viên",
        "full_name": "Lục Văn Quý",
        "position": "Chuyên viên",
        "dept_name": "Phòng Văn hóa",
        "phone": "",
    },
    # NS005
    {
        "emp_code": "NS005",
        "username": "dinh",
        "email": "dinh@gmail.com",
        "password": "admin127",
        "role": "Quản lý",
        "full_name": "Hà Tất Định",
        "position": "Quản lý",
        "dept_name": "Phòng Văn hóa",
        "phone": "",
    },
    # NS006
    {
        "emp_code": "NS006",
        "username": "dai",
        "email": "dai@gmail.com",
        "password": "admin128",
        "role": "Quản lý",
        "full_name": "Cao Thế Đại",
        "position": "Trưởng phòng",
        "dept_name": "Phòng Kinh tế",
        "phone": "",
    },
    # NS007
    {
        "emp_code": "NS007",
        "username": "sung",
        "email": "sung@gmail.com",
        "password": "admin129",
        "role": "Quản lý",
        "full_name": "Lý Seo Sùng",
        "position": "Chủ tịch MTTQ",
        "dept_name": "DV004",
        "phone": "",
    },
    # NS008
    {
        "emp_code": "NS008",
        "username": "buithuy",
        "email": "buithuy1138080@gmail.com",
        "password": "admin130",
        "role": "Nhân viên",
        "full_name": "Bùi Thanh Thủy",
        "position": "Nhân viên",
        "dept_name": "Văn phòng Đảng ủy",
        "phone": "",
    },
    # NS009
    {
        "emp_code": "NS009",
        "username": "ndhoa",
        "email": "ndhoa@gmail.com",
        "password": "admin131",
        "role": "Lãnh đạo",
        "full_name": "Nguyễn Duy Hòa",
        "position": "Bí thư - Trưởng Ban",
        "dept_name": "Đảng ủy xã Bắc Hà",
        "phone": "",
    },
    # NS010
    {
        "emp_code": "NS010",
        "username": "cuong",
        "email": "cuong@gmail.com",
        "password": "admin132",
        "role": "Quản lý",
        "full_name": "Đỗ Mạnh Cường",
        "position": "Trưởng Ban",
        "dept_name": "Ban xây dựng",
        "phone": "",
    },
    # NS011
    {
        "emp_code": "NS011",
        "username": "lttung",
        "email": "lttung@gmail.com",
        "password": "admin133",
        "role": "Quản lý",
        "full_name": "Lương Thanh Tùng",
        "position": "Giám đốc",
        "dept_name": "Trung tâm Phục vụ Hành chính công",
        "phone": "",
    },
    # NS012
    {
        "emp_code": "NS012",
        "username": "nqlai",
        "email": "nqlai@gmail.com",
        "password": "admin134",
        "role": "Quản lý",
        "full_name": "Nguyễn Quang Lai",
        "position": "Quản lý",
        "dept_name": "Ủy ban kiểm tra",
        "phone": "",
    },
    # NS013
    {
        "emp_code": "NS013",
        "username": "gahai",
        "email": "gahai@gmail.com",
        "password": "admin135",
        "role": "Quản lý",
        "full_name": "Giàng A Hải",
        "position": "Giám đốc",
        "dept_name": "Trung tâm Dịch vụ tổng hợp",
        "phone": "",
    },
    # NS014
    {
        "emp_code": "NS014",
        "username": "luong",
        "email": "luong@gmail.com",
        "password": "admin136",
        "role": "Quản lý",
        "full_name": "Lục Văn Lương",
        "position": "Giám đốc",
        "dept_name": "Ban QLDA Đầu tư XD KV Bắc Hà",
        "phone": "",
    },
    # NS015
    {
        "emp_code": "NS015",
        "username": "buithuy2",
        "email": "thuy@gmail.com",
        "password": "admin137",
        "role": "Quản lý",
        "full_name": "Bùi Thủy",
        "position": "",
        "dept_name": "Văn phòng Đảng ủy",
        "phone": "974099478",
    },
    # NS016
    {
        "emp_code": "NS016",
        "username": "men",
        "email": "men@gmail.com",
        "password": "admin138",
        "role": "Nhân viên",
        "full_name": "Nguyễn Thị Mến",
        "position": "Chuyên viên",
        "dept_name": "Phòng Văn hóa",
        "phone": "352811225",
    },
    # NS017
    {
        "emp_code": "NS017",
        "username": "bmhai",
        "email": "bmhai@gmail.com",
        "password": "admin139",
        "role": "Lãnh đạo",
        "full_name": "Bùi Minh Hải",
        "position": "Phó Bí thư",
        "dept_name": "UBND xã Bắc Hà",
        "phone": "911489489",
    },
    # NS018
    {
        "emp_code": "NS018",
        "username": "ntnon",
        "email": "ntnon@gmail.com",
        "password": "admin140",
        "role": "Lãnh đạo",
        "full_name": "Nguyễn Thị Non",
        "position": "Phó Chủ tịch",
        "dept_name": "UBND xã Bắc Hà",
        "phone": "868861980",
    },
    # NS019
    {
        "emp_code": "NS019",
        "username": "ntnghe",
        "email": "ntnghe@gmail.com",
        "password": "admin141",
        "role": "Admin",
        "full_name": "Nguyễn Tài Nghệ",
        "position": "Phó Chủ tịch",
        "dept_name": "UBND xã Bắc Hà",
        "phone": "912006962",
    },
]


async def seed(db: AsyncSession) -> None:
    print("\n" + "=" * 60)
    print("  IOC STAFF SEEDER")
    print("=" * 60)

    # 1. Build department code→id map
    dept_rows = (await db.execute(select(Department))).scalars().all()
    dept_by_code: dict[str, int] = {d.code: d.id for d in dept_rows if d.code}
    dept_by_name: dict[str, int] = {d.name: d.id for d in dept_rows}

    # 2. Create extra departments if missing
    for extra in EXTRA_DEPTS:
        if extra["code"] not in dept_by_code:
            dept = Department(
                code=extra["code"],
                name=extra["name"],
                short_name=extra["short_name"],
                sort_order=extra["sort_order"],
                dept_type="unit",
                is_active=True,
            )
            db.add(dept)
            await db.flush()
            dept_by_code[extra["code"]] = dept.id
            dept_by_name[extra["name"]] = dept.id
            print(f"  [CREATE DEPT] {extra['code']} — {extra['name']} (id={dept.id})")
        else:
            print(f"  [SKIP DEPT]   {extra['code']} already exists")

    # 3. Build user username→id and email→id maps
    user_rows = (await db.execute(select(User))).scalars().all()
    user_by_username: dict[str, User] = {u.username: u for u in user_rows}
    user_by_email: dict[str, User] = {u.email: u for u in user_rows}

    # 4. Build staff emp_code→Staff map
    staff_rows = (await db.execute(select(Staff))).scalars().all()
    staff_by_code: dict[str, Staff] = {s.employee_code: s for s in staff_rows if s.employee_code}
    staff_by_uid: dict[int, Staff] = {s.user_id: s for s in staff_rows if s.user_id}

    # 5. Process each record
    created_users = 0
    created_staff = 0
    linked = 0
    skipped = 0

    print()
    for rec in STAFF_DATA:
        emp_code = rec["emp_code"]
        role_sys = ROLE_MAP.get(rec["role"], "staff")

        # Resolve department_id
        dept_id: int | None = None
        if rec["dept_name"]:
            code = DEPT_CODE_MAP.get(rec["dept_name"])
            if code and code in dept_by_code:
                dept_id = dept_by_code[code]
            elif rec["dept_name"] in dept_by_name:
                dept_id = dept_by_name[rec["dept_name"]]

        # ── User ──────────────────────────────────────────────────────────────
        user: User | None = None

        existing_by_uname = user_by_username.get(rec["username"])
        existing_by_email = user_by_email.get(rec["email"])

        if existing_by_uname:
            user = existing_by_uname
            print(f"  [SKIP USER]   username '{rec['username']}' already exists (id={user.id})")
            skipped += 1
        elif existing_by_email:
            user = existing_by_email
            print(f"  [SKIP USER]   email '{rec['email']}' already exists → user '{user.username}' (id={user.id})")
            skipped += 1
        elif rec["password"]:
            user = User(
                username=rec["username"],
                email=rec["email"],
                hashed_password=hash_password(rec["password"]),
                full_name=rec["full_name"],
                role=role_sys,
                is_active=True,
            )
            db.add(user)
            await db.flush()
            user_by_username[user.username] = user
            user_by_email[user.email] = user
            print(f"  [CREATE USER] {rec['username']} / {rec['email']} / role={role_sys} (id={user.id})")
            created_users += 1

        # ── Staff ─────────────────────────────────────────────────────────────
        existing_staff: Staff | None = staff_by_code.get(emp_code)

        # Also check if staff already linked to this user
        if user and user.id in staff_by_uid:
            existing_staff = staff_by_uid[user.id]

        if existing_staff:
            updated = False
            # Link user if not linked
            if user and not existing_staff.user_id:
                existing_staff.user_id = user.id
                staff_by_uid[user.id] = existing_staff
                print(f"  [LINK STAFF]  {existing_staff.full_name} (id={existing_staff.id}) → user '{rec['username']}'")
                linked += 1
                updated = True
            # Update dept if missing
            if dept_id and not existing_staff.department_id:
                existing_staff.department_id = dept_id
                updated = True
            # Update employee_code if missing
            if not existing_staff.employee_code:
                existing_staff.employee_code = emp_code
                staff_by_code[emp_code] = existing_staff
                updated = True
            if not updated:
                print(f"  [SKIP STAFF]  {emp_code} / {existing_staff.full_name} already up-to-date")
                skipped += 1
        else:
            # Create new staff
            staff = Staff(
                employee_code=emp_code,
                full_name=rec["full_name"],
                position=rec["position"] or None,
                phone=rec["phone"] or None,
                email=rec["email"],
                department_id=dept_id,
                user_id=user.id if user else None,
                is_active=True,
            )
            db.add(staff)
            await db.flush()
            staff_by_code[emp_code] = staff
            if user:
                staff_by_uid[user.id] = staff
            print(f"  [CREATE STAFF] {emp_code} — {rec['full_name']} / dept_id={dept_id} / user_id={user.id if user else None} (id={staff.id})")
            created_staff += 1

    await db.commit()

    print()
    print("=" * 60)
    print(f"  XONG! Created users: {created_users}, staff: {created_staff}, linked: {linked}, skipped: {skipped}")
    print("=" * 60)


async def main() -> None:
    async with async_session_factory() as db:
        await seed(db)


if __name__ == "__main__":
    asyncio.run(main())
