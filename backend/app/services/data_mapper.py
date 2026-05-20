"""Field / column mapping engine.

Converts between Google Sheet rows (dict keyed by column letter)
and IOC model dicts (keyed by field name).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

# ── Vietnamese status → IOC status transforms ─────────────────────────────────

_STATUS_NQ57: dict[str, str] = {
    "chưa bắt đầu": "pending", "chưa thực hiện": "pending", "mới": "pending",
    "đang thực hiện": "in_progress", "đang triển khai": "in_progress", "đang làm": "in_progress",
    "hoàn thành": "completed", "hoàn thành 100%": "completed", "đã xong": "completed",
    "chậm tiến độ": "delayed", "quá hạn": "delayed", "trễ": "delayed",
}

_STATUS_TASK: dict[str, str] = {
    "chờ xử lý": "pending", "mới": "pending", "chưa làm": "pending",
    "đang thực hiện": "in_progress", "đang làm": "in_progress",
    "hoàn thành": "done", "xong": "done",
    "hủy": "cancelled", "đã hủy": "cancelled",
    "tạm dừng": "on_hold",
}

_STATUS_KPI: dict[str, str] = {
    "đạt mục tiêu": "dat_muc_tieu", "đạt": "dat_muc_tieu",
    "đúng tiến độ": "dung_tien_do", "đúng": "dung_tien_do",
    "có rủi ro": "co_rui_ro", "rủi ro": "co_rui_ro",
    "chậm tiến độ": "cham_tien_do", "chậm": "cham_tien_do",
    "quá hạn": "qua_han", "quá hạn thực hiện": "qua_han",
    "chưa bắt đầu": "chua_bat_dau",
}

# ── Default field mappings per entity type ────────────────────────────────────

DEFAULT_MAPPINGS: dict[str, list[dict[str, Any]]] = {
    "nq57": [
        {"ioc_field": "code",             "sheet_col": "B", "transform": None},
        {"ioc_field": "group",            "sheet_col": "C", "transform": None},
        {"ioc_field": "title",            "sheet_col": "D", "transform": None},
        {"ioc_field": "target",           "sheet_col": "E", "transform": None},
        {"ioc_field": "responsible_unit", "sheet_col": "F", "transform": None},
        {"ioc_field": "deadline",         "sheet_col": "G", "transform": "date"},
        {"ioc_field": "progress",         "sheet_col": "H", "transform": "int"},
        {"ioc_field": "status",           "sheet_col": "I", "transform": "status_nq57"},
        {"ioc_field": "description",      "sheet_col": "J", "transform": None},
    ],
    "task": [
        {"ioc_field": "title",       "sheet_col": "B", "transform": None},
        {"ioc_field": "status",      "sheet_col": "C", "transform": "status_task"},
        {"ioc_field": "priority",    "sheet_col": "D", "transform": None},
        {"ioc_field": "due_date",    "sheet_col": "E", "transform": "date"},
        {"ioc_field": "progress",    "sheet_col": "F", "transform": "int"},
        {"ioc_field": "description", "sheet_col": "G", "transform": None},
    ],
    "kpi": [
        {"ioc_field": "name",          "sheet_col": "B", "transform": None},
        {"ioc_field": "target_value",  "sheet_col": "C", "transform": "float"},
        {"ioc_field": "current_value", "sheet_col": "D", "transform": "float"},
        {"ioc_field": "unit",          "sheet_col": "E", "transform": None},
        {"ioc_field": "status",        "sheet_col": "F", "transform": "status_kpi"},
    ],
}


def get_default_mappings(entity_type: str) -> list[dict[str, Any]]:
    return DEFAULT_MAPPINGS.get(entity_type, [])


# ── Sheet → IOC ───────────────────────────────────────────────────────────────

def sheet_row_to_ioc(
    row: dict[str, str],
    mappings: list[dict[str, Any]],
    entity_type: str,
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for m in mappings:
        raw = row.get(m["sheet_col"], "")
        if raw == "" or raw is None:
            if m.get("default") is not None:
                result[m["ioc_field"]] = m["default"]
            continue
        result[m["ioc_field"]] = _apply_transform(raw, m.get("transform"), entity_type)
    return result


# ── IOC → Sheet ───────────────────────────────────────────────────────────────

def ioc_record_to_sheet_row(
    record: dict[str, Any],
    mappings: list[dict[str, Any]],
    total_cols: int,
) -> list[str]:
    from app.services.gsheet_service import col_index

    row = [""] * total_cols
    for m in mappings:
        idx = col_index(m["sheet_col"])
        if idx >= total_cols:
            continue
        val = record.get(m["ioc_field"])
        row[idx] = _format_value(val)
    return row


def _format_value(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, bool):
        return "Có" if val else "Không"
    if isinstance(val, (date, datetime)):
        return val.strftime("%d/%m/%Y")
    return str(val)


# ── Transforms ────────────────────────────────────────────────────────────────

def _apply_transform(value: str, transform: str | None, entity_type: str) -> Any:
    if not transform:
        return value.strip() if isinstance(value, str) else value

    v = str(value).strip()

    if transform == "int":
        try:
            return int(float(v.replace(",", "").replace("%", "").replace(" ", "")))
        except (ValueError, TypeError):
            return 0

    if transform == "float":
        try:
            return float(v.replace(",", "").replace(" ", ""))
        except (ValueError, TypeError):
            return 0.0

    if transform == "date":
        return _parse_date(v)

    if transform == "bool":
        return v.lower() in ("1", "true", "có", "x", "yes", "y")

    if transform == "status_nq57":
        return _STATUS_NQ57.get(v.lower(), v.lower().replace(" ", "_"))

    if transform == "status_task":
        return _STATUS_TASK.get(v.lower(), v.lower().replace(" ", "_"))

    if transform == "status_kpi":
        return _STATUS_KPI.get(v.lower(), v.lower().replace(" ", "_"))

    return v


def _parse_date(value: str) -> str | None:
    """Parse various date formats → ISO date string (YYYY-MM-DD)."""
    if not value:
        return None
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d.%m.%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    # Fallback: try dateutil if available
    try:
        from dateutil import parser as du
        return du.parse(value, dayfirst=True).date().isoformat()
    except Exception:
        return None
