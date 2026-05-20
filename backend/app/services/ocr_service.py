"""OCR Service — wraps pytesseract + PyMuPDF with graceful fallbacks."""
from __future__ import annotations

import io
import logging
import uuid
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Optional heavy deps ────────────────────────────────────────────────────────

try:
    import pytesseract
    from PIL import Image
    if settings.OCR_TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = settings.OCR_TESSERACT_CMD
    PYTESSERACT_OK = True
except ImportError:
    PYTESSERACT_OK = False
    logger.warning("pytesseract/Pillow not installed — OCR will return placeholder text.")

try:
    import fitz  # PyMuPDF
    PYMUPDF_OK = True
except ImportError:
    PYMUPDF_OK = False
    logger.warning("PyMuPDF not installed — PDF OCR unavailable.")

# ── Upload directory ───────────────────────────────────────────────────────────

_UPLOAD_ROOT = Path(settings.UPLOAD_DIR) / "ocr"
_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif"}
MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB

# Tesseract language — Vietnamese + English
_TESS_LANG = "vie+eng"
_TESS_CONFIG = r"--oem 3 --psm 6"


# ── Public helpers ─────────────────────────────────────────────────────────────

def is_ocr_available() -> bool:
    if not PYTESSERACT_OK:
        return False
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


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
        logger.warning("Could not delete OCR file %s: %s", file_path, exc)


# ── Core OCR ───────────────────────────────────────────────────────────────────

def ocr_file(file_path: Path) -> tuple[str, int]:
    """Synchronous OCR entry point — safe to call from asyncio.to_thread().
    Returns (extracted_text, page_count).
    """
    ext = file_path.suffix.lower()
    if ext == ".pdf":
        return _ocr_pdf(file_path)
    elif ext in ALLOWED_EXTENSIONS:
        return _ocr_image_file(file_path), 1
    else:
        return f"[Định dạng không hỗ trợ: {ext}]", 0


def _ocr_image(img: "Image.Image") -> str:  # type: ignore[name-defined]
    if not PYTESSERACT_OK:
        return "[OCR không khả dụng — cần cài Tesseract và pytesseract]"
    try:
        return pytesseract.image_to_string(img, lang=_TESS_LANG, config=_TESS_CONFIG)
    except Exception as exc:
        logger.error("pytesseract error: %s", exc)
        # Common reason: Vietnamese lang pack missing
        try:
            return pytesseract.image_to_string(img, lang="eng", config=_TESS_CONFIG)
        except Exception:
            return f"[Lỗi OCR: {exc}]"


def _ocr_image_file(file_path: Path) -> str:
    if not PYTESSERACT_OK:
        return "[Cần cài pytesseract + Tesseract để OCR ảnh]"
    try:
        from PIL import Image
        with Image.open(file_path) as img:
            # Normalise for better OCR accuracy
            img = img.convert("RGB")
            return _ocr_image(img)
    except Exception as exc:
        return f"[Lỗi đọc ảnh: {exc}]"


def _ocr_pdf(file_path: Path) -> tuple[str, int]:
    if not PYMUPDF_OK:
        return "[PyMuPDF không khả dụng — cần cài PyMuPDF để đọc PDF]", 0

    try:
        import fitz  # noqa: F811
        doc = fitz.open(str(file_path))
        page_count = len(doc)
        pages_text: list[str] = []

        for idx in range(page_count):
            page = doc[idx]
            # Try embedded text first (digital PDF)
            text = page.get_text().strip()
            if len(text) >= 60:
                pages_text.append(f"--- Trang {idx + 1} ---\n{text}")
                continue

            # Render page to image and OCR (scanned PDF)
            mat = fitz.Matrix(2.0, 2.0)  # 2x for better accuracy
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")

            if PYTESSERACT_OK:
                from PIL import Image
                img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                ocr_text = _ocr_image(img)
                pages_text.append(f"--- Trang {idx + 1} ---\n{ocr_text}")
            else:
                pages_text.append(f"--- Trang {idx + 1} ---\n[Cần pytesseract để OCR scan]")

        doc.close()
        return "\n\n".join(pages_text), page_count

    except Exception as exc:
        logger.error("PDF OCR error: %s", exc)
        return f"[Lỗi xử lý PDF: {exc}]", 0
