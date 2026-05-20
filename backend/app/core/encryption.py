"""Field-level encryption for sensitive DB columns (e.g. credentials_json).

Uses Fernet symmetric encryption. Key is loaded from settings.FERNET_KEY.
Falls back to plaintext when key is not set (development convenience only).
"""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet | None:
    k = settings.FERNET_KEY
    if not k or k == "":
        return None
    return Fernet(k.encode() if isinstance(k, str) else k)


def encrypt_field(plaintext: str | None) -> str | None:
    """Encrypt a string field before storing in DB. Returns None for None."""
    if plaintext is None:
        return None
    f = _fernet()
    if f is None:
        return plaintext  # dev fallback — no key configured
    return f.encrypt(plaintext.encode()).decode()


def decrypt_field(ciphertext: str | None) -> str | None:
    """Decrypt a string field read from DB. Returns None for None.
    Falls back to returning the original value if decryption fails
    (handles already-plaintext rows from before encryption was added).
    """
    if ciphertext is None:
        return None
    f = _fernet()
    if f is None:
        return ciphertext  # dev fallback
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except (InvalidToken, Exception):
        # Row was stored before encryption — return as-is
        return ciphertext
