"""AI Parser Service — rule-based extraction for Vietnamese administrative documents.

No external API needed.  Patterns match standard UBND/HĐND document formats.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

# ── Document type keywords ──────────────────────────────────────────────────

_DOC_TYPES: dict[str, str] = {
    "CÔNG VĂN": "Công văn",
    "QUYẾT ĐỊNH": "Quyết định",
    "NGHỊ QUYẾT": "Nghị quyết",
    "CHỈ THỊ": "Chỉ thị",
    "KẾ HOẠCH": "Kế hoạch",
    "THÔNG BÁO": "Thông báo",
    "BÁO CÁO": "Báo cáo",
    "TỜ TRÌNH": "Tờ trình",
    "BIÊN BẢN": "Biên bản",
    "CHƯƠNG TRÌNH": "Chương trình",
    "HƯỚNG DẪN": "Hướng dẫn",
    "ĐỀ ÁN": "Đề án",
}

_PRIORITY_KW = {
    "hỏa tốc": "urgent",
    "thượng khẩn": "urgent",
    "khẩn": "high",
    "ưu tiên": "high",
}

_THIS_YEAR = datetime.now().year

# ── Quarter conversion ──────────────────────────────────────────────────────

_Q_MAP = {"I": 1, "1": 1, "II": 2, "2": 2, "III": 3, "3": 3, "IV": 4, "4": 4}


def _q_num(s: str) -> int | None:
    return _Q_MAP.get(s.upper().strip())


def _date_str(day: str, month: str, year: str) -> str:
    return f"{year}-{month.zfill(2)}-{day.zfill(2)}"


# ── Main entry point ────────────────────────────────────────────────────────

def parse_document(text: str) -> dict[str, Any]:
    """Parse OCR text and return structured extraction result."""
    return {
        "van_ban": _extract_doc_info(text),
        "nhiem_vu": _extract_tasks(text),
        "kpi": _extract_kpi(text),
        "canh_bao": _validate(text),
    }


# ── Document info ───────────────────────────────────────────────────────────

def _extract_doc_info(text: str) -> dict[str, Any]:
    info: dict[str, Any] = {}

    # Document number  e.g. "Số: 123/UBND-VP" or "Số 45/TB-HĐND"
    m = re.search(r'[Ss]ố[:\s]+(\d+[-/][A-Z0-9/\-]+)', text)
    if m:
        info["so_ky_hieu"] = m.group(1).strip().rstrip(".")

    # Document type — scan uppercase version of text
    tu = text.upper()
    for kw, label in _DOC_TYPES.items():
        if kw in tu:
            info["loai_van_ban"] = label
            break

    # Issue date: "ngày DD tháng MM năm YYYY"
    m = re.search(
        r'ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})',
        text, re.IGNORECASE
    )
    if m:
        info["ngay_ban_hanh"] = _date_str(*m.groups())
    else:
        # Fallback: DD/MM/YYYY
        m = re.search(r'\b(\d{1,2})/(\d{1,2})/(\d{4})\b', text)
        if m:
            info["ngay_ban_hanh"] = _date_str(*m.groups())

    # Subject/Summary — "V/v:" or "Về việc:"
    m = re.search(r'[Vv]/[Vv][:\s]+(.{10,300}?)(?:\n|$)', text)
    if m:
        info["trich_yeu"] = m.group(1).strip()
    if "trich_yeu" not in info:
        m = re.search(r'[Vv]ề\s+việc[:\s]+(.{10,300}?)(?:\n|$)', text, re.IGNORECASE)
        if m:
            info["trich_yeu"] = m.group(1).strip()

    # Issuing authority — UBND / HĐND + level
    m = re.search(
        r'(UBND|HĐND|ỦY BAN NHÂN DÂN|HỘI ĐỒNG NHÂN DÂN)'
        r'\s+(xã|phường|thị\s+trấn|thị\s+xã|huyện|tỉnh|thành\s+phố|quận)'
        r'\s+([\w\s]{2,40}?)(?:\n|$)',
        text, re.IGNORECASE
    )
    if m:
        info["co_quan_ban_hanh"] = " ".join(m.group(0).split())

    # Priority
    tl = text.lower()
    for kw, prio in _PRIORITY_KW.items():
        if kw in tl:
            info["uu_tien"] = prio
            break

    return info


# ── Task extraction ─────────────────────────────────────────────────────────

_NUMBERED_ITEM = re.compile(
    r'^[\s]*(?:\d{1,2}[.)]\s+|[a-záàảãạăắặẵẩâấầẩậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ][.)]\s+)'
    r'(.{15,})',
    re.IGNORECASE | re.UNICODE
)

_DEADLINE_PATS = [
    re.compile(r'trước\s+ngày\s+(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})'),
    re.compile(r'chậm\s+nhất\s+(?:(?:ngày\s+)?(\d{1,2})[/\-](\d{1,2})[/\-](\d{4}))'),
    re.compile(r'trước\s+ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})', re.IGNORECASE),
    re.compile(r'trước\s+tháng\s+(\d{1,2})[/\-](\d{4})'),  # "trước tháng 6/2026" → day=1
    re.compile(r'trong\s+quý\s+([IVX1-4]+)\s+năm\s+(\d{4})', re.IGNORECASE),
]

_UNIT_PATS = [
    re.compile(r'[Gg]iao\s+([\w\s]{5,60}?)\s+(?:thực hiện|chủ trì|phối hợp)'),
    re.compile(r'([\w\s]{5,60}?)\s+chủ\s+trì'),
    re.compile(r'[Yy]êu\s+cầu\s+([\w\s]{5,60}?)\s+(?:thực hiện|báo cáo|triển khai)'),
]


def _try_deadline(line: str) -> str | None:
    for pat in _DEADLINE_PATS:
        m = pat.search(line)
        if not m:
            continue
        g = m.groups()
        if len(g) == 3:
            # Might be D/M/Y or M/Y (from tháng pattern)
            if pat.pattern.startswith(r'trước\s+tháng'):
                # g = (month, year)
                return _date_str("01", g[0], g[1])
            return _date_str(g[0], g[1], g[2])
        if len(g) == 2:
            # quý + year
            q = _q_num(g[0])
            if q:
                # last day of quarter
                end_month = str(q * 3)
                return _date_str("30", end_month, g[1])
    return None


def _try_unit(line: str) -> str | None:
    for pat in _UNIT_PATS:
        m = pat.search(line)
        if m:
            return m.group(1).strip()
    return None


def _extract_tasks(text: str) -> list[dict[str, Any]]:
    tasks: list[dict[str, Any]] = []
    lines = text.splitlines()
    current: dict[str, Any] | None = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        m = _NUMBERED_ITEM.match(stripped)
        if m:
            if current:
                tasks.append(current)
            current = {
                "ten_nhiem_vu": m.group(1).strip(),
                "mo_ta": "",
                "deadline": None,
                "don_vi_chu_tri": None,
                "muc_uu_tien": "medium",
            }
        elif current:
            current["mo_ta"] = (current.get("mo_ta", "") + " " + stripped).strip()

        # Look for deadline and unit in current line regardless of item type
        dl = _try_deadline(stripped)
        if dl and current and not current["deadline"]:
            current["deadline"] = dl

        unit = _try_unit(stripped)
        if unit and current and not current["don_vi_chu_tri"]:
            current["don_vi_chu_tri"] = unit

        # Priority from line
        tl = stripped.lower()
        for kw, prio in _PRIORITY_KW.items():
            if kw in tl and current:
                current["muc_uu_tien"] = prio
                break

    if current:
        tasks.append(current)

    return tasks[:20]


# ── KPI extraction ──────────────────────────────────────────────────────────

_PCT_PAT = re.compile(
    r'(.{10,120}?)'
    r'\s+(?:đạt|hoàn\s+thành|phấn\s+đấu|tỷ\s+lệ|đạt\s+tỷ\s+lệ)'
    r'\s+[\w\s]{0,20}?'
    r'(\d+(?:[.,]\d+)?)\s*%',
    re.IGNORECASE
)
_YEAR_PAT = re.compile(r'năm\s+(\d{4})', re.IGNORECASE)
_QUY_PAT = re.compile(r'quý\s+([IVX1-4]+)', re.IGNORECASE)


def _extract_kpi(text: str) -> list[dict[str, Any]]:
    kpis: list[dict[str, Any]] = []
    seen: set[str] = set()

    for m in _PCT_PAT.finditer(text):
        ten = m.group(1).strip().rstrip(",:;")
        # Deduplicate by first 40 chars
        key = ten[:40]
        if key in seen:
            continue
        seen.add(key)

        pct = float(m.group(2).replace(",", "."))
        ctx = text[max(0, m.start() - 100): m.end() + 100]

        year = _THIS_YEAR
        ym = _YEAR_PAT.search(ctx)
        if ym:
            year = int(ym.group(1))

        quy: int | None = None
        qm = _QUY_PAT.search(ctx)
        if qm:
            quy = _q_num(qm.group(1))

        kpis.append({
            "ten": ten[:200],
            "muc_tieu_pct": pct,
            "nam": year,
            "quy": quy,
            "loai_kpi": "quy" if quy else "nam",
        })

    return kpis[:10]


# ── Validation ──────────────────────────────────────────────────────────────

def _validate(text: str) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []

    if not re.search(r'[Ss]ố[:\s]+\d', text):
        warnings.append({"field": "so_ky_hieu", "message": "Không tìm thấy số ký hiệu văn bản"})

    if not re.search(r'ngày\s+\d{1,2}\s+tháng', text, re.IGNORECASE):
        warnings.append({"field": "ngay_ban_hanh", "message": "Không tìm thấy ngày ban hành"})

    if not re.search(r'UBND|HĐND|ỦY BAN|HỘI ĐỒNG', text, re.IGNORECASE):
        warnings.append({"field": "co_quan", "message": "Không nhận diện được cơ quan ban hành"})

    # Check tasks missing deadline
    tasks = _extract_tasks(text)
    missing_dl = sum(1 for t in tasks if not t.get("deadline"))
    if missing_dl > 0:
        warnings.append({
            "field": "nhiem_vu_deadline",
            "message": f"{missing_dl} nhiệm vụ chưa có deadline",
        })

    # Check tasks missing unit
    missing_unit = sum(1 for t in tasks if not t.get("don_vi_chu_tri"))
    if missing_unit > 0:
        warnings.append({
            "field": "nhiem_vu_don_vi",
            "message": f"{missing_unit} nhiệm vụ chưa xác định đơn vị phụ trách",
        })

    return warnings
