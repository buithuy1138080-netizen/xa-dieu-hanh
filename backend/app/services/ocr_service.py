"""OCR Service — PaddleOCR + PyMuPDF with text/scanned PDF detection.

Pipeline:
  PDF  → is_text_pdf? → YES: PyMuPDF text extract
                      → NO:  PaddleOCR on rendered page images
  DOCX → python-docx text extract
  TXT  → plain read (multi-encoding)
  IMG  → PaddleOCR
"""
from __future__ import annotations

import io
import logging
import uuid
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── PyMuPDF ───────────────────────────────────────────────────────────────────

try:
    import fitz  # PyMuPDF
    PYMUPDF_OK = True
except ImportError:
    PYMUPDF_OK = False
    logger.warning("PyMuPDF not installed — PDF processing unavailable.")

# ── PaddleOCR (lazy-init to avoid slow startup; checked at import time) ───────

PADDLEOCR_OK = False
_paddle_ocr_instance: Any | None = None
_paddle_init_attempted = False

try:
    import paddleocr as _paddleocr_mod  # noqa: F401
    PADDLEOCR_OK = True  # library present; instance created on first use
except ImportError:
    logger.warning("paddleocr not installed — scanned image OCR disabled. Install with: pip install paddleocr")


def _get_paddle() -> Any | None:
    """Return a PaddleOCR instance, initialising on first call."""
    global _paddle_ocr_instance, _paddle_init_attempted, PADDLEOCR_OK
    if _paddle_init_attempted:
        return _paddle_ocr_instance
    _paddle_init_attempted = True
    if not PADDLEOCR_OK:
        return None
    try:
        from paddleocr import PaddleOCR
        # lang="vi" for Vietnamese; use_angle_cls=True handles rotated text
        _paddle_ocr_instance = PaddleOCR(use_angle_cls=True, lang="vi", show_log=False)
        logger.info("PaddleOCR initialised (lang=vi)")
    except Exception as exc:
        logger.error("PaddleOCR init failed: %s", exc)
        PADDLEOCR_OK = False
    return _paddle_ocr_instance


# ── Upload directory ───────────────────────────────────────────────────────────

_UPLOAD_ROOT = Path(settings.UPLOAD_DIR) / "ocr"
_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".docx", ".doc", ".txt"}
MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB

# Minimum avg chars/page for a PDF to be considered "text" (not scanned)
_TEXT_PDF_CHARS_THRESHOLD = 60


# ── Public helpers ─────────────────────────────────────────────────────────────

def save_upload(content: bytes, original_filename: str) -> Path:
    """Save raw bytes to upload dir and return the path."""
    ext = Path(original_filename).suffix.lower() or ".bin"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = _UPLOAD_ROOT / safe_name
    dest.write_bytes(content)
    return dest


def delete_file(file_path: str) -> None:
    try:
        p = Path(file_path)
        if p.exists():
            p.unlink()
    except Exception as exc:
        logger.warning("Could not delete file %s: %s", file_path, exc)


def is_text_pdf(file_path: Path, sample_pages: int = 3) -> bool:
    """Return True if the PDF has embedded text (not a scanned image).

    Samples the first `sample_pages` pages; if average char count >= threshold
    the document is classified as a digital (text) PDF.
    """
    if not PYMUPDF_OK:
        return False
    try:
        import fitz as _fitz
        doc = _fitz.open(str(file_path))
        pages = min(sample_pages, len(doc))
        if pages == 0:
            doc.close()
            return False
        total_chars = sum(len(doc[i].get_text().strip()) for i in range(pages))
        doc.close()
        return (total_chars / pages) >= _TEXT_PDF_CHARS_THRESHOLD
    except Exception as exc:
        logger.warning("is_text_pdf check failed: %s", exc)
        return False


# ── Core OCR ───────────────────────────────────────────────────────────────────

def ocr_file(file_path: Path) -> tuple[str, int]:
    """Synchronous OCR entry point — safe to call from asyncio.to_thread().
    Returns (extracted_text, page_count).
    """
    ext = file_path.suffix.lower()
    if ext == ".pdf":
        return _ocr_pdf(file_path)
    elif ext in {".docx", ".doc"}:
        return _extract_docx(file_path), 1
    elif ext == ".txt":
        return _extract_txt(file_path), 1
    elif ext in {".jpg", ".jpeg", ".png"}:
        return _ocr_image_file(file_path), 1
    else:
        return f"[Định dạng không hỗ trợ: {ext}]", 0


def _extract_docx(file_path: Path) -> str:
    """Extract text from DOCX using python-docx."""
    try:
        from docx import Document as DocxDoc
        doc = DocxDoc(str(file_path))
        parts: list[str] = []
        for para in doc.paragraphs:
            t = para.text.strip()
            if t:
                parts.append(t)
        for table in doc.tables:
            for row in table.rows:
                row_texts = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_texts:
                    parts.append(" | ".join(row_texts))
        return "\n".join(parts)
    except Exception as exc:
        logger.error("DOCX extraction error: %s", exc)
        return f"[Lỗi đọc DOCX: {exc}]"


def _extract_txt(file_path: Path) -> str:
    """Read TXT file trying multiple encodings (Vietnamese-aware)."""
    for enc in ("utf-8", "utf-8-sig", "cp1258", "latin-1"):
        try:
            return file_path.read_text(encoding=enc).strip()
        except Exception:
            continue
    return "[Không đọc được file TXT]"


def _paddle_ocr_bytes(img_bytes: bytes) -> str:
    """Run PaddleOCR on raw image bytes; return joined text lines."""
    paddle = _get_paddle()
    if paddle is None:
        return "[OCR không khả dụng — cần cài paddleocr]"
    try:
        import numpy as np
        from PIL import Image
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        arr = np.array(img)
        result = paddle.ocr(arr, cls=True)
        lines: list[str] = []
        if result:
            for page_result in result:
                if not page_result:
                    continue
                for line in page_result:
                    if line and len(line) >= 2:
                        text_info = line[1]
                        txt = text_info[0] if isinstance(text_info, (list, tuple)) else str(text_info)
                        if txt.strip():
                            lines.append(txt.strip())
        return "\n".join(lines)
    except Exception as exc:
        logger.error("PaddleOCR error: %s", exc)
        return f"[Lỗi OCR: {exc}]"


def _ocr_image_file(file_path: Path) -> str:
    """OCR a standalone image file via PaddleOCR."""
    if not PADDLEOCR_OK:
        return "[Cần cài paddleocr để OCR ảnh]"
    try:
        return _paddle_ocr_bytes(file_path.read_bytes())
    except Exception as exc:
        return f"[Lỗi đọc ảnh: {exc}]"


def _ocr_pdf(file_path: Path) -> tuple[str, int]:
    """Extract text from PDF.

    Per-page strategy:
      - Embedded text >= threshold → use PyMuPDF directly (fast, accurate)
      - Otherwise → render page to 2x PNG → PaddleOCR (handles scanned pages)
    """
    if not PYMUPDF_OK:
        return "[PyMuPDF không khả dụng — cần cài PyMuPDF]", 0
    try:
        import fitz as _fitz
        doc = _fitz.open(str(file_path))
        page_count = len(doc)
        pages_text: list[str] = []

        for idx in range(page_count):
            page = doc[idx]
            text = page.get_text().strip()
            if len(text) >= _TEXT_PDF_CHARS_THRESHOLD:
                # Digital PDF page — use embedded text
                pages_text.append(f"--- Trang {idx + 1} ---\n{text}")
            else:
                # Scanned page — render to image then PaddleOCR
                mat = _fitz.Matrix(2.0, 2.0)  # 2× scale for better OCR accuracy
                pix = page.get_pixmap(matrix=mat)
                img_bytes = pix.tobytes("png")
                ocr_text = _paddle_ocr_bytes(img_bytes)
                pages_text.append(f"--- Trang {idx + 1} ---\n{ocr_text}")

        doc.close()
        return "\n\n".join(pages_text), page_count

    except Exception as exc:
        logger.error("PDF OCR error: %s", exc)
        return f"[Lỗi xử lý PDF: {exc}]", 0
