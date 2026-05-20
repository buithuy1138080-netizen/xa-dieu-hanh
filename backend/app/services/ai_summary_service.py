"""AI Summary Service — generates Vietnamese administrative report text.

Uses template-based generation with dynamic data insertion.
No external API required.
"""
from __future__ import annotations

from typing import Any

# ── Helpers ────────────────────────────────────────────────────────────────────

def _pct_label(pct: float) -> str:
    if pct >= 90: return "đạt kết quả xuất sắc"
    if pct >= 80: return "đạt kết quả tốt"
    if pct >= 70: return "cơ bản đạt yêu cầu"
    if pct >= 60: return "đạt ở mức trung bình"
    return "còn nhiều hạn chế, chưa đạt yêu cầu"

def _pct_adj(pct: float) -> str:
    if pct >= 90: return "cao"
    if pct >= 70: return "khá"
    if pct >= 50: return "trung bình"
    return "thấp"

def _overdue_note(overdue: int, total: int) -> str:
    if overdue == 0:
        return "Không có nhiệm vụ quá hạn."
    pct = round(overdue / total * 100, 1) if total else 0
    return (
        f"Tuy nhiên, còn {overdue} nhiệm vụ quá hạn ({pct}%), "
        f"cần tập trung đôn đốc, đẩy nhanh tiến độ thực hiện."
    )

def _kpi_note(kpis: dict) -> str:
    total = kpis.get("total", 0)
    if not total:
        return ""
    avg = kpis.get("avg_pct", 0)
    dat = kpis.get("by_status", {}).get("dat_muc_tieu", 0)
    qua_han = kpis.get("by_status", {}).get("qua_han", 0)
    note = (
        f"Về chỉ tiêu KPI chiến lược: tổng số {total} chỉ tiêu, "
        f"tỷ lệ hoàn thành bình quân đạt {avg}%, "
        f"có {dat} chỉ tiêu đạt mục tiêu."
    )
    if qua_han:
        note += f" Còn {qua_han} chỉ tiêu quá hạn cần xử lý."
    return note

def _best_dept(dept_bd: list[dict]) -> str:
    if not dept_bd:
        return ""
    best = max(dept_bd, key=lambda d: d.get("rate", 0))
    if best["total"] and best["rate"] >= 70:
        return f" Đơn vị thực hiện tốt nhất là {best['name']} (đạt {best['rate']}%)."
    return ""

def _slow_depts(dept_bd: list[dict]) -> str:
    slow = [d for d in dept_bd if d["total"] and d.get("rate", 100) < 50]
    if not slow:
        return ""
    names = ", ".join(d["name"] for d in slow[:3])
    return f" Một số đơn vị thực hiện chậm: {names}."


# ── Main entry point ────────────────────────────────────────────────────────────

def generate_summary(data: dict[str, Any], report_type: str) -> dict[str, str]:
    """Generate a structured executive summary from aggregated report data."""
    tasks    = data.get("tasks", {})
    kpis     = data.get("kpis", {})
    docs     = data.get("documents", {})
    overdue  = data.get("overdue_tasks", [])
    dept_bd  = data.get("dept_breakdown", [])
    period   = data.get("period", {})
    nq57     = data.get("nq57", {})

    label    = period.get("label", "kỳ báo cáo")
    total    = tasks.get("total", 0)
    completed = tasks.get("completed", 0)
    rate     = tasks.get("completion_rate", 0.0)
    n_overdue = tasks.get("overdue", 0)

    # ── 1. Tổng quát ──────────────────────────────────────────────────────────
    tong_quat = (
        f"Trong {label}, Ủy ban nhân dân xã đã tập trung lãnh đạo, chỉ đạo "
        f"triển khai thực hiện các nhiệm vụ theo chương trình công tác. "
        f"Tổng số nhiệm vụ được giao là {total}, trong đó hoàn thành {completed} nhiệm vụ, "
        f"{_pct_label(rate)} (đạt {rate}%). "
        f"{_overdue_note(n_overdue, total)} "
        f"{_kpi_note(kpis)}"
    ).strip()

    # ── 2. Đánh giá tiến độ ───────────────────────────────────────────────────
    in_prog  = tasks.get("in_progress", 0)
    pending  = tasks.get("pending", 0)
    danh_gia = (
        f"Tỷ lệ hoàn thành nhiệm vụ đạt {rate}%, ở mức {_pct_adj(rate)}. "
        f"Hiện còn {in_prog} nhiệm vụ đang thực hiện và {pending} nhiệm vụ chờ triển khai. "
        f"{_best_dept(dept_bd)}"
        f"{_slow_depts(dept_bd)} "
    ).strip()

    if docs.get("total", 0):
        danh_gia += (
            f" Trong {label}, tiếp nhận và xử lý {docs['total']} văn bản, "
            f"trong đó đã xử lý {docs.get('processed', 0)} văn bản."
        )

    # ── 3. Tồn tại hạn chế ────────────────────────────────────────────────────
    ton_tai_items = []
    if n_overdue:
        ton_tai_items.append(
            f"Một số nhiệm vụ ({n_overdue} nhiệm vụ) thực hiện chưa đúng tiến độ, quá hạn."
        )
    slow = [d for d in dept_bd if d["total"] and d.get("rate", 100) < 60]
    if slow:
        ton_tai_items.append(
            f"Hiệu quả thực hiện nhiệm vụ tại một số đơn vị còn thấp, "
            f"đặc biệt là {', '.join(d['name'] for d in slow[:2])}."
        )
    kpi_qua_han = kpis.get("by_status", {}).get("qua_han", 0)
    if kpi_qua_han:
        ton_tai_items.append(
            f"Còn {kpi_qua_han} chỉ tiêu KPI chiến lược chưa đạt, quá hạn thực hiện."
        )
    if not ton_tai_items:
        ton_tai_items.append(
            "Một số nhiệm vụ còn chậm so với kế hoạch, cần đôn đốc thực hiện."
        )
    ton_tai = "\n".join(f"- {item}" for item in ton_tai_items)

    # ── 4. Nguyên nhân ────────────────────────────────────────────────────────
    nguyen_nhan = (
        "- Khối lượng công việc lớn, nguồn nhân lực còn hạn chế ở một số đơn vị.\n"
        "- Một số nhiệm vụ phụ thuộc vào yếu tố bên ngoài, cần phối hợp nhiều ngành.\n"
        "- Công tác phối hợp giữa các đơn vị đôi khi chưa kịp thời, hiệu quả."
    )

    # ── 5. Kiến nghị ─────────────────────────────────────────────────────────
    kien_nghi_items = [
        "Tiếp tục đẩy mạnh ứng dụng công nghệ thông tin trong quản lý, điều hành.",
        "Tăng cường kiểm tra, đôn đốc các đơn vị thực hiện nhiệm vụ theo tiến độ.",
    ]
    if n_overdue:
        kien_nghi_items.append(
            f"Ưu tiên xử lý {n_overdue} nhiệm vụ quá hạn, báo cáo nguyên nhân cụ thể."
        )
    if kpi_qua_han:
        kien_nghi_items.append(
            "Rà soát, điều chỉnh các chỉ tiêu KPI chưa phù hợp thực tế triển khai."
        )
    kien_nghi = "\n".join(f"- {item}" for item in kien_nghi_items)

    # ── 6. Nhiệm vụ trọng tâm tiếp theo ──────────────────────────────────────
    nhiem_vu_trong_tam = (
        f"- Tập trung giải quyết dứt điểm {n_overdue + pending} nhiệm vụ tồn đọng và chờ xử lý.\n"
        "- Rà soát, cập nhật tiến độ các nhiệm vụ đang thực hiện.\n"
        "- Tổ chức họp đánh giá kết quả và triển khai nhiệm vụ kỳ tiếp theo.\n"
        "- Tiếp tục triển khai các chỉ tiêu KPI chiến lược theo kế hoạch."
    )

    # ── NQ57 note (only for nq57 report type) ────────────────────────────────
    if report_type == "nq57" and nq57.get("total"):
        n57_total = nq57["total"]
        n57_done  = nq57.get("completed", 0)
        n57_avg   = nq57.get("avg_progress", 0)
        tong_quat += (
            f" Riêng nhiệm vụ theo Nghị quyết 57: tổng số {n57_total} nhiệm vụ, "
            f"hoàn thành {n57_done}, tiến độ bình quân đạt {n57_avg}%."
        )

    return {
        "tong_quat":          tong_quat,
        "danh_gia_tien_do":   danh_gia,
        "ton_tai_han_che":    ton_tai,
        "nguyen_nhan":        nguyen_nhan,
        "kien_nghi":          kien_nghi,
        "nhiem_vu_trong_tam": nhiem_vu_trong_tam,
    }
