"""
variable_registry.py

Maps template variable names → resolved values from report_engine data.
Call resolve_variables(db, period_from, period_to) to get a flat dict
ready for template substitution.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import func, select

from app.core.config import settings
from app.services import report_engine

# ── Scalar variable catalog ────────────────────────────────────────────────────

SCALAR_CATALOG: list[dict] = [
    {"name": "ten_don_vi",               "description": "Tên đơn vị",                     "example": "UBND xã Bắc Hà"},
    {"name": "ngay_bao_cao",             "description": "Ngày lập báo cáo",                "example": "19/05/2026"},
    {"name": "ky_bao_cao",              "description": "Nhãn kỳ báo cáo",                 "example": "Tháng 05/2026"},
    {"name": "tu_ngay",                  "description": "Từ ngày",                          "example": "01/05/2026"},
    {"name": "den_ngay",                 "description": "Đến ngày",                         "example": "31/05/2026"},
    {"name": "thang",                    "description": "Tháng",                            "example": "5"},
    {"name": "quy",                      "description": "Quý",                              "example": "II"},
    {"name": "nam",                      "description": "Năm",                              "example": "2026"},
    {"name": "tong_nhiem_vu",            "description": "Tổng số nhiệm vụ",                "example": "45"},
    {"name": "nhiem_vu_hoan_thanh",      "description": "Nhiệm vụ hoàn thành",             "example": "30"},
    {"name": "nhiem_vu_dang_thuc_hien",  "description": "Nhiệm vụ đang thực hiện",         "example": "10"},
    {"name": "nhiem_vu_cho_xu_ly",       "description": "Nhiệm vụ chờ xử lý",              "example": "3"},
    {"name": "nhiem_vu_qua_han",         "description": "Nhiệm vụ quá hạn",                "example": "2"},
    {"name": "ti_le_hoan_thanh",         "description": "Tỉ lệ hoàn thành (%)",            "example": "66.7%"},
    {"name": "tong_van_ban",             "description": "Tổng văn bản trong kỳ",           "example": "12"},
    {"name": "van_ban_da_xu_ly",         "description": "Văn bản đã xử lý",                "example": "10"},
    {"name": "van_ban_den",              "description": "Văn bản đến",                     "example": "8"},
    {"name": "van_ban_di",               "description": "Văn bản đi",                      "example": "4"},
    {"name": "tong_kpi",                 "description": "Tổng chỉ tiêu KPI",               "example": "20"},
    {"name": "ti_le_kpi",                "description": "Tỉ lệ hoàn thành KPI (%)",        "example": "75.0%"},
    {"name": "tong_nq57",                "description": "Tổng nhiệm vụ NQ57",              "example": "15"},
    {"name": "nq57_hoan_thanh",          "description": "Hoàn thành NQ57",                 "example": "10"},
    {"name": "ti_le_nq57",               "description": "Tiến độ NQ57 (%)",                "example": "67.0%"},
    {"name": "tong_chi_dao",             "description": "Tổng chỉ đạo",                    "example": "8"},
]

# ── List variable catalog ──────────────────────────────────────────────────────

LIST_CATALOG: list[dict] = [
    {
        "name": "danh_sach_nhiem_vu_qua_han",
        "description": "Danh sách nhiệm vụ quá hạn",
        "example": "{{#danh_sach_nhiem_vu_qua_han}} ... {{/danh_sach_nhiem_vu_qua_han}}",
        "item_fields": ["stt", "ten", "han", "don_vi", "uu_tien", "so_ngay_tre"],
    },
    {
        "name": "phan_tich_don_vi",
        "description": "Phân tích theo đơn vị",
        "example": "{{#phan_tich_don_vi}} ... {{/phan_tich_don_vi}}",
        "item_fields": ["stt", "ten_don_vi", "tong", "hoan_thanh", "ti_le"],
    },
]


# ── Main resolver ──────────────────────────────────────────────────────────────

async def resolve_variables(
    db: AsyncSession,
    period_from: date,
    period_to: date,
) -> dict[str, Any]:
    """
    Collect all data and return a flat dict mapping variable_name → value.
    Includes both scalar values and list values (for loop expansion).
    """
    from app.models.directive import Directive

    data = await report_engine.collect_data(db, period_from, period_to, "monthly")

    directive_count = (await db.execute(
        select(func.count(Directive.id)).where(Directive.deleted_at.is_(None))
    )).scalar_one()

    tasks = data.get("tasks", {})
    kpis  = data.get("kpis", {})
    docs  = data.get("documents", {})
    nq57  = data.get("nq57", {})
    overdue_list  = data.get("overdue_tasks", [])
    dept_breakdown = data.get("dept_breakdown", [])

    # ── Date helpers ────────────────────────────────────────────────────────────
    from datetime import datetime as dt
    today = dt.now()
    q_num = (period_from.month - 1) // 3 + 1
    q_label = ["I", "II", "III", "IV"][q_num - 1]

    # ── Scalar variables ────────────────────────────────────────────────────────
    total_tasks = tasks.get("total", 0)
    completed   = tasks.get("completed", 0)
    rate        = tasks.get("completion_rate", 0.0)

    by_type = docs.get("by_type", {})
    incoming = by_type.get("incoming", 0)
    outgoing = by_type.get("outgoing", 0)

    kpi_total   = kpis.get("total", 0)
    kpi_avg_pct = kpis.get("avg_pct", 0.0)

    nq57_total = nq57.get("total", 0)
    nq57_done  = nq57.get("completed", 0)
    nq57_pct   = nq57.get("avg_progress", 0.0)

    scalars: dict[str, Any] = {
        "ten_don_vi":              settings.ORG_NAME,
        "ngay_bao_cao":            today.strftime("%d/%m/%Y"),
        "ky_bao_cao":             data["period"].get("label", ""),
        "tu_ngay":                 period_from.strftime("%d/%m/%Y"),
        "den_ngay":                period_to.strftime("%d/%m/%Y"),
        "thang":                   str(period_from.month),
        "quy":                     q_label,
        "nam":                     str(period_from.year),
        "tong_nhiem_vu":           str(total_tasks),
        "nhiem_vu_hoan_thanh":     str(completed),
        "nhiem_vu_dang_thuc_hien": str(tasks.get("in_progress", 0)),
        "nhiem_vu_cho_xu_ly":      str(tasks.get("pending", 0)),
        "nhiem_vu_qua_han":        str(tasks.get("overdue", 0)),
        "ti_le_hoan_thanh":        f"{rate:.1f}%",
        "tong_van_ban":            str(docs.get("total", 0)),
        "van_ban_da_xu_ly":        str(docs.get("processed", 0)),
        "van_ban_den":             str(incoming),
        "van_ban_di":              str(outgoing),
        "tong_kpi":                str(kpi_total),
        "ti_le_kpi":               f"{kpi_avg_pct:.1f}%",
        "tong_nq57":               str(nq57_total),
        "nq57_hoan_thanh":         str(nq57_done),
        "ti_le_nq57":              f"{nq57_pct:.1f}%",
        "tong_chi_dao":            str(directive_count),
    }

    # ── List variables ───────────────────────────────────────────────────────────
    scalars["danh_sach_nhiem_vu_qua_han"] = [
        {
            "stt":       str(i + 1),
            "ten":       row.get("title", ""),
            "han":       _fmt_date(row.get("due_date")),
            "don_vi":    row.get("dept", ""),
            "uu_tien":   _priority_label(row.get("priority", "")),
            "so_ngay_tre": str(row.get("days_late", 0)),
        }
        for i, row in enumerate(overdue_list)
    ]

    scalars["phan_tich_don_vi"] = [
        {
            "stt":       str(i + 1),
            "ten_don_vi": row.get("name", ""),
            "tong":      str(row.get("total", 0)),
            "hoan_thanh": str(row.get("completed", 0)),
            "ti_le":     f'{row.get("rate", 0):.1f}%',
        }
        for i, row in enumerate(dept_breakdown)
    ]

    return scalars


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fmt_date(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        from datetime import datetime as dt
        d = dt.fromisoformat(iso.replace("Z", "+00:00"))
        return d.strftime("%d/%m/%Y")
    except Exception:
        return str(iso)[:10]


def _priority_label(p: str) -> str:
    return {"high": "Cao", "medium": "Trung bình", "low": "Thấp",
            "urgent": "Khẩn", "normal": "Thường"}.get(p, p)
