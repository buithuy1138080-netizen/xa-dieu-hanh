"""Vietnamese text normalizer for OCR post-processing."""
from __future__ import annotations

import re
import unicodedata

_MULTI_SPACE = re.compile(r"[ \t]{2,}")
_MULTI_NEWLINE = re.compile(r"\n{3,}")
_BULLET_NORM = re.compile(r"^[\s]*[•·▪▸►▶‣⁃]\s*", re.MULTILINE)
_PAGE_HEADER = re.compile(r"--- Trang \d+ ---\n?")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean(text: str) -> str:
    """Normalize OCR text: NFC unicode, remove control chars, collapse whitespace."""
    if not text:
        return ""
    # NFC normalize — critical for Vietnamese diacritics consistency
    text = unicodedata.normalize("NFC", text)
    # Strip control characters (OCR artifacts)
    text = _CONTROL_CHARS.sub("", text)
    # Remove page separators inserted by ocr_service
    text = _PAGE_HEADER.sub("", text)
    # Normalize bullet variants to ASCII dash
    text = _BULLET_NORM.sub("- ", text)
    # Collapse multiple spaces/tabs
    text = _MULTI_SPACE.sub(" ", text)
    # Strip leading/trailing whitespace per line
    lines = [ln.strip() for ln in text.splitlines()]
    text = "\n".join(lines)
    # Collapse excessive blank lines
    text = _MULTI_NEWLINE.sub("\n\n", text)
    return text.strip()
