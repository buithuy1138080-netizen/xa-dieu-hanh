"""AI Parser Service — Vietnamese administrative document analysis.

Pipeline:
  File → (vision) Gemini Vision  → structured JSON
       → (text)   Gemini Text    → structured JSON
       → (fallback) regex        → partial extraction

Output structure (preserved for backward compat with /ocr/confirm):
  {
    "van_ban":   { metadata fields },
    "nhiem_vu":  [ task dicts ],
    "kpi":       [ target/KPI dicts ],
    "ngan_sach": [ budget dicts ],   ← new
    "canh_bao":  [ warning dicts ],
  }
"""
from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

# ── Constants ───────────────────────────────────────────────────────────────

_THIS_YEAR = datetime.now().year

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

# ── Gemini system prompt ────────────────────────────────────────────────────

_GEMINI_SYSTEM_PROMPT = """Bạn là AI chuyên phân tích văn bản hành chính Việt Nam cho hệ thống IOC cấp xã.

Đọc toàn bộ nội dung văn bản và trả về JSON CHÍNH XÁC theo cấu trúc sau (KHÔNG thêm giải thích, KHÔNG markdown ngoài JSON):

{
  "metadata": {
    "document_type": "loại văn bản: Công văn/Quyết định/Nghị quyết/Chỉ thị/Kế hoạch/Thông báo/Báo cáo/Tờ trình/Biên bản/Chương trình/Hướng dẫn/Đề án",
    "document_number": "số ký hiệu văn bản: (1) Ưu tiên dòng 'Số:' hoặc 'SỐ:' ở phần đầu, dạng 222/TB-UBND không khoảng trắng. (2) Nếu không có dòng 'Số:', tìm chuỗi dạng 'số/loại-cơ quan' trong 10 dòng đầu (VD: 0759/CV-VBD, 15/QĐ-HĐND). KHÔNG lấy từ phần Căn cứ/nội dung điều khoản. Nếu thực sự không tìm thấy → null",
    "issued_date": "ngày ban hành trên phần đầu văn bản, dạng YYYY-MM-DD hoặc null",
    "issuing_agency": "tên cơ quan ban hành (dòng trên cùng bên trái, VD: UBND XÃ BẮC HÀ) hoặc null",
    "signer": "Chức vụ + Họ tên người ký ở cuối văn bản hoặc null",
    "trich_yeu": "trích yếu văn bản: (1) Ưu tiên lấy NGUYÊN VĂN dòng 'V/v:' hoặc 'Về việc:'. (2) Nếu không có, lấy tiêu đề IN HOA chính của văn bản. (3) Nếu vẫn không có, tóm tắt 1 câu ngắn nội dung chính. LUÔN phải có giá trị, KHÔNG được null",
    "summary": "tóm tắt 2-3 câu ngắn nội dung chính bằng tiếng Việt"
  },
  "tasks": [
    {
      "task_name": "tên nhiệm vụ ngắn gọn (tối đa 200 ký tự)",
      "description": "mô tả chi tiết nhiệm vụ",
      "lead_agency": "đơn vị chủ trì hoặc null",
      "cooperate_agency": ["đơn vị phối hợp"],
      "deadline": "YYYY-MM-DD hoặc null",
      "priority": "urgent|high|medium|low"
    }
  ],
  "targets": [
    {
      "target_name": "tên chỉ tiêu/mục tiêu KPI",
      "target_value": "giá trị mục tiêu (VD: 95, 100, 5.2)",
      "unit": "đơn vị đo: %, người, tỷ đồng, hộ, km, ...",
      "deadline": "YYYY-MM-DD hoặc null"
    }
  ],
  "budgets": [
    {
      "budget_name": "tên khoản/hạng mục ngân sách",
      "amount": "số tiền dạng chuỗi (VD: '5.2 tỷ đồng', '500 triệu đồng')",
      "funding_source": "nguồn vốn (ngân sách nhà nước/xã hội hóa/vốn đầu tư/tài trợ/...)"
    }
  ]
}

Quy tắc BẮT BUỘC:
- Chỉ trích xuất thông tin CÓ TRONG văn bản, không bịa đặt.
- Nếu không có nhiệm vụ/chỉ tiêu/ngân sách → trả mảng rỗng [].
- document_number: Tìm ở phần header (10 dòng đầu). Không lấy từ "Căn cứ Luật số...", "Nghị định số...", "Quyết định số..." trong nội dung bài. Không có khoảng trắng (VD: "15/QĐ-HĐND").
- trich_yeu: LUÔN phải có giá trị. Ưu tiên V/v: → tiêu đề IN HOA → tóm tắt 1 câu. KHÔNG được null.
- Ngày: format YYYY-MM-DD. Nếu chỉ có tháng/năm → lấy ngày đầu tháng (VD: tháng 6/2026 → "2026-06-01").
- Ưu tiên nhiệm vụ: urgent=hỏa tốc/thượng khẩn, high=khẩn, medium=mặc định, low=thông thường.
- Chỉ tiêu/KPI: trích xuất tất cả chỉ tiêu có con số (tỷ lệ %, số lượng, giá trị tuyệt đối).
- Ngân sách: trích xuất tất cả khoản chi có số tiền cụ thể."""

# ── Retry config ────────────────────────────────────────────────────────────

_MAX_RETRIES = 3
_RETRY_DELAYS = (1.0, 2.0, 4.0)


# ── Gemini client helpers ───────────────────────────────────────────────────

def _parse_gemini_json(raw: str) -> dict[str, Any] | None:
    """Extract and parse JSON from Gemini response, stripping code fences."""
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw)
    m = re.search(r"\{[\s\S]+\}", raw)
    if not m:
        return None
    try:
        return json.loads(m.group())
    except json.JSONDecodeError as exc:
        logger.warning("JSON parse failed: %s — raw: %.200s", exc, raw)
        return None


def _call_gemini_with_retry(
    payload: list[bytes] | str,
    *,
    is_vision: bool = False,
) -> dict[str, Any] | None:
    """Call Gemini (vision or text) with exponential-backoff retry.

    Args:
        payload: list[bytes] (PNG images) for vision mode, str for text mode.
        is_vision: True to send images; False to send plain text.
    Returns:
        Parsed dict from Gemini JSON response, or None on failure.
    """
    try:
        from app.core.config import settings
        if not settings.GEMINI_API_KEY:
            logger.debug("GEMINI_API_KEY not set — AI extraction skipped")
            return None
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
    except Exception as exc:
        logger.warning("Gemini client init failed: %s", exc)
        return None

    for attempt in range(_MAX_RETRIES):
        try:
            if is_vision:
                assert isinstance(payload, list)
                contents: Any = []
                for img_bytes in payload:
                    contents.append(types.Part.from_bytes(data=img_bytes, mime_type="image/png"))
                contents.append(types.Part.from_text(text=_GEMINI_SYSTEM_PROMPT))
            else:
                assert isinstance(payload, str)
                contents = f"{_GEMINI_SYSTEM_PROMPT}\n\nNội dung văn bản:\n\n{payload[:12000]}"

            response = client.models.generate_content(
                model="models/gemini-2.5-flash",
                contents=contents,
            )
            result = _parse_gemini_json(response.text)
            if result:
                return result
            logger.warning("Gemini attempt %d: response has no valid JSON", attempt + 1)
        except Exception as exc:
            logger.warning("Gemini attempt %d/%d failed: %s", attempt + 1, _MAX_RETRIES, exc)
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAYS[attempt])

    return None


# ── Groq fallback (llama) ───────────────────────────────────────────────────

def _call_groq_with_retry(text: str) -> dict[str, Any] | None:
    """Fallback: call Groq (llama) text API when Gemini is unavailable."""
    try:
        from app.core.config import settings
        if not getattr(settings, "GROQ_API_KEY", None):
            return None
        import urllib.request, json as _json
        model = getattr(settings, "GROQ_MODEL", "llama-3.3-70b-versatile")
    except Exception:
        return None

    prompt = f"{_GEMINI_SYSTEM_PROMPT}\n\nNội dung văn bản:\n\n{text[:12000]}"
    body = _json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 4096,
    }).encode()

    for attempt in range(_MAX_RETRIES):
        try:
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=body,
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = _json.loads(resp.read())
            raw = data["choices"][0]["message"]["content"]
            result = _parse_gemini_json(raw)
            if result:
                return result
        except Exception as exc:
            logger.warning("Groq attempt %d/%d failed: %s", attempt + 1, _MAX_RETRIES, exc)
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAYS[attempt])

    return None


# ── Output mapping ──────────────────────────────────────────────────────────

def _build_output(ai_data: dict[str, Any]) -> dict[str, Any]:
    """Map AI JSON response to internal output format."""
    meta = ai_data.get("metadata") or {}

    so_ky_hieu = meta.get("document_number")
    if so_ky_hieu:
        so_ky_hieu = re.sub(r"\s+", "", str(so_ky_hieu))

    van_ban: dict[str, Any] = {
        "co_quan_ban_hanh": meta.get("issuing_agency"),
        "so_ky_hieu":       so_ky_hieu,
        "loai_van_ban":     meta.get("document_type"),
        "ngay_ban_hanh":    meta.get("issued_date"),
        "nguoi_ky":         meta.get("signer"),
        "trich_yeu":        meta.get("trich_yeu") or meta.get("summary"),
        "summary_points":   [],
        "tu_khoa":          [],
    }

    nhiem_vu: list[dict[str, Any]] = []
    for t in (ai_data.get("tasks") or []):
        nhiem_vu.append({
            "ten_nhiem_vu":    (t.get("task_name") or "")[:300],
            "mo_ta":           t.get("description") or "",
            "don_vi_chu_tri":  t.get("lead_agency"),
            "don_vi_phoi_hop": t.get("cooperate_agency") or [],
            "deadline":        t.get("deadline"),
            "muc_uu_tien":     t.get("priority") or "medium",
        })

    kpi: list[dict[str, Any]] = []
    for k in (ai_data.get("targets") or []):
        kpi.append({
            "ten":      (k.get("target_name") or "")[:200],
            "gia_tri":  k.get("target_value"),
            "don_vi":   k.get("unit"),
            "deadline": k.get("deadline"),
            "loai_kpi": "nam",
        })

    ngan_sach: list[dict[str, Any]] = []
    for b in (ai_data.get("budgets") or []):
        ngan_sach.append({
            "ten_hang_muc": (b.get("budget_name") or "")[:200],
            "so_tien":      b.get("amount"),
            "nguon_von":    b.get("funding_source"),
        })

    return {
        "van_ban":   van_ban,
        "nhiem_vu":  nhiem_vu,
        "kpi":       kpi,
        "ngan_sach": ngan_sach,
        "canh_bao":  [],
    }


def _validate_result(result: dict[str, Any]) -> list[dict[str, str]]:
    """Validate AI extraction result and return list of warning dicts."""
    warnings: list[dict[str, str]] = []
    van_ban = result.get("van_ban") or {}

    if not van_ban.get("so_ky_hieu"):
        warnings.append({"field": "so_ky_hieu", "message": "Không tìm thấy số ký hiệu văn bản"})
    if not van_ban.get("ngay_ban_hanh"):
        warnings.append({"field": "ngay_ban_hanh", "message": "Không tìm thấy ngày ban hành"})
    if not van_ban.get("co_quan_ban_hanh"):
        warnings.append({"field": "co_quan", "message": "Không nhận diện được cơ quan ban hành"})

    tasks = result.get("nhiem_vu") or []
    missing_dl = sum(1 for t in tasks if not t.get("deadline"))
    if missing_dl:
        warnings.append({"field": "nhiem_vu_deadline", "message": f"{missing_dl} nhiệm vụ chưa có deadline"})

    missing_unit = sum(1 for t in tasks if not t.get("don_vi_chu_tri"))
    if missing_unit:
        warnings.append({"field": "nhiem_vu_don_vi", "message": f"{missing_unit} nhiệm vụ chưa xác định đơn vị"})

    return warnings


# ── Main entry points ───────────────────────────────────────────────────────

def parse_file_with_vision(file_path: "Path") -> dict[str, Any]:
    """Primary entry point: file → Gemini Vision → structured result.

    Converts PDF pages to PNG images and sends them to Gemini Vision for
    accurate reading of both digital and scanned documents.
    Falls back to text extraction → Gemini text API → regex.
    """
    from pathlib import Path as _Path
    from app.services.text_cleaner import clean as _clean

    ext = _Path(file_path).suffix.lower()

    # DOCX / TXT: extract text then use Gemini text API
    if ext in {".docx", ".doc", ".txt"}:
        from app.services import ocr_service as _ocr
        text, _ = _ocr.ocr_file(_Path(file_path))
        return parse_document(_clean(text))

    image_bytes_list: list[bytes] = []

    if ext == ".pdf":
        try:
            import fitz
            doc = fitz.open(str(file_path))
            for i in range(len(doc)):  # all pages — no artificial limit
                pix = doc[i].get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
                image_bytes_list.append(pix.tobytes("png"))
            doc.close()
        except Exception as exc:
            logger.error("PDF→image conversion failed: %s", exc)
    elif ext in {".jpg", ".jpeg", ".png"}:
        image_bytes_list = [_Path(file_path).read_bytes()]

    # ── Vision path ───────────────────────────────────────────────────────
    if image_bytes_list:
        ai_data = _call_gemini_with_retry(image_bytes_list, is_vision=True)
        if ai_data:
            result = _build_output(ai_data)
            result["canh_bao"] = _validate_result(result)
            return result
        logger.info("Gemini Vision failed — falling back to text extraction + Groq/regex")

    # ── Text fallback (OCR text → Gemini text → Groq → regex) ────────────
    from app.services import ocr_service
    text, _ = ocr_service.ocr_file(_Path(file_path))
    return parse_document(_clean(text))


def parse_document(text: str) -> dict[str, Any]:
    """Parse OCR text and return structured extraction.

    Tries Gemini text API → Groq (llama) → regex fallback.
    """
    from app.services.text_cleaner import clean as _clean
    text = _clean(text)

    ai_data = _call_gemini_with_retry(text, is_vision=False)
    if not ai_data:
        logger.info("Gemini text failed — trying Groq fallback")
        ai_data = _call_groq_with_retry(text)

    if ai_data:
        result = _build_output(ai_data)
        result["canh_bao"] = _validate_result(result)
        return result

    # Regex fallback — all AI providers failed
    logger.info("All AI providers failed — using regex extraction")
    van_ban = _extract_doc_info(text)
    van_ban.setdefault("summary_points", [])
    van_ban.setdefault("tu_khoa", [])
    tasks = _extract_tasks(text)
    kpis = _extract_kpi(text)
    return {
        "van_ban":   van_ban,
        "nhiem_vu":  tasks,
        "kpi":       kpis,
        "ngan_sach": [],
        "canh_bao":  _validate(text),
    }


# ── Regex fallback: document info ───────────────────────────────────────────

_EXCLUDE_HEADER = re.compile(
    r"ĐẢNG\s+CỘNG\s+SẢN|CỘNG\s+HÒA|Độc\s+lập|ĐỘC\s+LẬP"
    r"|Hạnh\s+phúc|HẠNH\s+PHÚC|Tự\s+do|TỰ\s+DO"
    r"|^\*+\s*$|^-+\s*$|^={3,}",
    re.IGNORECASE,
)
_DATE_LINE = re.compile(r"ngày\s+\d|,\s*ngày|\d{1,2}/\d{1,2}/\d{4}", re.IGNORECASE)
_SO_LINE = re.compile(r"^[Ss][ốo][\s:,]", re.IGNORECASE)


def _extract_doc_info(text: str) -> dict[str, Any]:
    info: dict[str, Any] = {}
    raw_lines = text.splitlines()
    non_empty = [l.strip() for l in raw_lines if l.strip()]

    so_idx: int | None = None
    for i, ln in enumerate(non_empty):
        if _SO_LINE.match(ln):
            so_idx = i
            break

    _ORG_EXCLUDE = re.compile(
        r"ĐẢNG\s+BỘ\s+TỈNH|TỈNH\s+ỦY|UBND\s+TỈNH|BỘ\s+[A-Z]|UỶ\s+BAN\s+NHÂN\s+DÂN\s+TỈNH",
        re.IGNORECASE,
    )
    pre = non_empty[:so_idx] if so_idx is not None else non_empty[:8]
    org_candidates = []
    for ln in pre:
        if not ln or len(ln) < 3:
            continue
        if _EXCLUDE_HEADER.search(ln):
            left = re.split(r"\t{2,}|\s{3,}", ln)[0].strip()
            if (left and len(left) > 3
                    and not _EXCLUDE_HEADER.search(left)
                    and not _DATE_LINE.search(left)
                    and not _ORG_EXCLUDE.search(left)):
                org_candidates.append(left)
            continue
        if _DATE_LINE.search(ln) or _ORG_EXCLUDE.search(ln):
            continue
        org_candidates.append(ln)
    if org_candidates:
        info["co_quan_ban_hanh"] = org_candidates[-1]

    # Tìm số ký hiệu trong dòng "Số:" ở header
    if so_idx is not None:
        so_line = non_empty[so_idx]
        m = re.search(r"[Ss][ốo][\s:,]+(\d[\d\s]*[-/][^\n\s,;]+)", so_line)
        if m:
            info["so_ky_hieu"] = re.sub(r"\s+", "", m.group(1).strip().rstrip("."))
    if "so_ky_hieu" not in info:
        header_text = "\n".join(non_empty[:20])
        # Tìm dòng "Số: ..." rõ ràng
        m = re.search(r"^[Ss][ốo][\s:,]+(\d+\s*[-/][A-ZĐÀÁẢÃẠ0-9/\-a-záàảãạ]+)", header_text, re.MULTILINE)
        if m:
            info["so_ky_hieu"] = re.sub(r"\s+", "", m.group(1).strip().rstrip("."))
    if "so_ky_hieu" not in info:
        # Fallback: tìm pattern số/loại-cơquan trong 10 dòng đầu (VD: 0759/CV-VBD)
        header_text = "\n".join(non_empty[:10])
        m = re.search(r"\b(\d{1,5}[-/][A-ZĐÀÁẢÃẠ]{2,}[-/][A-ZĐÀÁẢÃẠ]{2,})\b", header_text)
        if m:
            info["so_ky_hieu"] = re.sub(r"\s+", "", m.group(1).strip())

    tu = text.upper()
    for kw, label in _DOC_TYPES.items():
        if kw in tu:
            info["loai_van_ban"] = label
            break

    m = re.search(r"ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})", text, re.IGNORECASE)
    if m:
        d, mo, y = m.groups()
        info["ngay_ban_hanh"] = f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
    else:
        m = re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", text)
        if m:
            d, mo, y = m.groups()
            info["ngay_ban_hanh"] = f"{y}-{mo.zfill(2)}-{d.zfill(2)}"

    m = re.search(r"[Vv]/[Vv][:\s]+(.{10,300}?)(?:\n|$)", text)
    if m:
        info["trich_yeu"] = m.group(1).strip()
    if "trich_yeu" not in info:
        m = re.search(r"[Vv]ề\s+việc[:\s]+(.{10,300}?)(?:\n|$)", text, re.IGNORECASE)
        if m:
            info["trich_yeu"] = m.group(1).strip()
    if "trich_yeu" not in info:
        # Fallback: tìm dòng tiêu đề IN HOA dài > 15 ký tự sau phần header
        for ln in non_empty[3:15]:
            if (len(ln) > 15 and ln == ln.upper()
                    and not _EXCLUDE_HEADER.search(ln)
                    and not _DATE_LINE.search(ln)
                    and not _SO_LINE.match(ln)):
                info["trich_yeu"] = ln.strip()
                break

    tl = text.lower()
    for kw, prio in _PRIORITY_KW.items():
        if kw in tl:
            info["uu_tien"] = prio
            break

    return info


# ── Regex fallback: task extraction ────────────────────────────────────────

_NUMBERED_ITEM = re.compile(
    r"^[\s]*(?:\d{1,2}[.)]\s+|[a-záàảãạăắặẵẩâấầẩậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ][.)]\s+)"
    r"(.{15,})",
    re.IGNORECASE | re.UNICODE,
)

_DEADLINE_PATS = [
    re.compile(r"trước\s+ngày\s+(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})"),
    re.compile(r"chậm\s+nhất\s+(?:(?:ngày\s+)?(\d{1,2})[/\-](\d{1,2})[/\-](\d{4}))"),
    re.compile(r"trước\s+ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})", re.IGNORECASE),
    re.compile(r"trước\s+tháng\s+(\d{1,2})[/\-](\d{4})"),
    re.compile(r"trong\s+quý\s+([IVX1-4]+)\s+năm\s+(\d{4})", re.IGNORECASE),
]

_UNIT_PATS = [
    re.compile(r"[Gg]iao\s+([\w\s]{5,60}?)\s+(?:thực hiện|chủ trì|phối hợp)"),
    re.compile(r"([\w\s]{5,60}?)\s+chủ\s+trì"),
    re.compile(r"[Yy]êu\s+cầu\s+([\w\s]{5,60}?)\s+(?:thực hiện|báo cáo|triển khai)"),
]

_Q_MAP = {"I": 1, "1": 1, "II": 2, "2": 2, "III": 3, "3": 3, "IV": 4, "4": 4}


def _q_num(s: str) -> int | None:
    return _Q_MAP.get(s.upper().strip())


def _try_deadline(line: str) -> str | None:
    for pat in _DEADLINE_PATS:
        m = pat.search(line)
        if not m:
            continue
        g = m.groups()
        if len(g) == 3:
            if pat.pattern.startswith(r"trước\s+tháng"):
                return f"{g[1]}-{g[0].zfill(2)}-01"
            d, mo, y = g
            return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
        if len(g) == 2:
            q = _q_num(g[0])
            if q:
                return f"{g[1]}-{str(q * 3).zfill(2)}-30"
    return None


def _try_unit(line: str) -> str | None:
    for pat in _UNIT_PATS:
        m = pat.search(line)
        if m:
            return m.group(1).strip()
    return None


def _extract_tasks(text: str) -> list[dict[str, Any]]:
    tasks: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for line in text.splitlines():
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
                "don_vi_phoi_hop": [],
                "muc_uu_tien": "medium",
            }
        elif current:
            current["mo_ta"] = (current.get("mo_ta", "") + " " + stripped).strip()

        dl = _try_deadline(stripped)
        if dl and current and not current["deadline"]:
            current["deadline"] = dl

        unit = _try_unit(stripped)
        if unit and current and not current["don_vi_chu_tri"]:
            current["don_vi_chu_tri"] = unit

        tl = stripped.lower()
        for kw, prio in _PRIORITY_KW.items():
            if kw in tl and current:
                current["muc_uu_tien"] = prio
                break

    if current:
        tasks.append(current)

    return tasks[:20]


# ── Regex fallback: KPI extraction ─────────────────────────────────────────

_PCT_PAT = re.compile(
    r"(.{10,120}?)"
    r"\s+(?:đạt|hoàn\s+thành|phấn\s+đấu|tỷ\s+lệ|đạt\s+tỷ\s+lệ)"
    r"\s+[\w\s]{0,20}?"
    r"(\d+(?:[.,]\d+)?)\s*%",
    re.IGNORECASE,
)
_YEAR_PAT = re.compile(r"năm\s+(\d{4})", re.IGNORECASE)
_QUY_PAT = re.compile(r"quý\s+([IVX1-4]+)", re.IGNORECASE)


def _extract_kpi(text: str) -> list[dict[str, Any]]:
    kpis: list[dict[str, Any]] = []
    seen: set[str] = set()

    for m in _PCT_PAT.finditer(text):
        ten = m.group(1).strip().rstrip(",:;")
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
            "ten":       ten[:200],
            "gia_tri":   str(pct),
            "don_vi":    "%",
            "deadline":  None,
            "loai_kpi":  "quy" if quy else "nam",
        })

    return kpis[:10]


# ── Regex fallback: validation ──────────────────────────────────────────────

def _validate(text: str) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []

    if not re.search(r"[Ss]ố[:\s]+\d", text):
        warnings.append({"field": "so_ky_hieu", "message": "Không tìm thấy số ký hiệu văn bản"})
    if not re.search(r"ngày\s+\d{1,2}\s+tháng", text, re.IGNORECASE):
        warnings.append({"field": "ngay_ban_hanh", "message": "Không tìm thấy ngày ban hành"})
    if not re.search(r"UBND|HĐND|ỦY BAN|HỘI ĐỒNG", text, re.IGNORECASE):
        warnings.append({"field": "co_quan", "message": "Không nhận diện được cơ quan ban hành"})

    tasks = _extract_tasks(text)
    missing_dl = sum(1 for t in tasks if not t.get("deadline"))
    if missing_dl:
        warnings.append({"field": "nhiem_vu_deadline", "message": f"{missing_dl} nhiệm vụ chưa có deadline"})
    missing_unit = sum(1 for t in tasks if not t.get("don_vi_chu_tri"))
    if missing_unit:
        warnings.append({"field": "nhiem_vu_don_vi", "message": f"{missing_unit} nhiệm vụ chưa xác định đơn vị"})

    return warnings
