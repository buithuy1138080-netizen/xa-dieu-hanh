"""Zalo API wrapper.

Supports:
  OA Message API  — send text to OA followers (by zalo_user_id)
  ZNS API         — send template message to phone numbers
  Token refresh   — auto-renew OA access token

Graceful fallback: if httpx is not installed or credentials are missing,
all functions return a dict with error != 0 rather than raising.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

try:
    import httpx
    _HTTPX_OK = True
except ImportError:
    _HTTPX_OK = False
    logger.warning("httpx not installed — Zalo API calls disabled. Run: pip install httpx")

# ── Zalo API endpoints ────────────────────────────────────────────────────────

_OA_API = "https://openapi.zalo.me/v2.0/oa"
_ZNS_API = "https://business.openapi.zalo.me/message/template"
_TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token"
_TIMEOUT = 12.0


def _no_httpx() -> dict:
    return {"error": -99, "message": "httpx not installed"}


# ── OA Message (send to follower by zalo_user_id) ────────────────────────────

async def send_oa_message(
    access_token: str,
    zalo_user_id: str,
    text: str,
) -> dict[str, Any]:
    if not _HTTPX_OK:
        return _no_httpx()
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_OA_API}/message/cs",
                headers={"access_token": access_token},
                json={
                    "recipient": {"user_id": zalo_user_id},
                    "message": {"text": text},
                },
            )
            return resp.json()
    except Exception as exc:
        logger.warning("Zalo OA send failed: %s", exc)
        return {"error": -1, "message": str(exc)}


# ── ZNS (send to phone number using approved template) ───────────────────────

async def send_zns(
    access_token: str,
    phone: str,
    zns_template_id: str,
    template_data: dict[str, str],
    tracking_id: str = "",
) -> dict[str, Any]:
    if not _HTTPX_OK:
        return _no_httpx()
    # Normalise phone: remove leading 0, add +84
    phone_norm = _normalise_phone(phone)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                _ZNS_API,
                headers={"access_token": access_token},
                json={
                    "phone": phone_norm,
                    "template_id": zns_template_id,
                    "template_data": template_data,
                    "tracking_id": tracking_id or "",
                },
            )
            return resp.json()
    except Exception as exc:
        logger.warning("Zalo ZNS send failed phone=%s: %s", phone, exc)
        return {"error": -1, "message": str(exc)}


# ── Token management ──────────────────────────────────────────────────────────

async def refresh_token(
    app_id: str,
    app_secret: str,
    refresh_token_str: str,
) -> dict[str, Any]:
    if not _HTTPX_OK:
        return _no_httpx()
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                _TOKEN_URL,
                data={
                    "app_id": app_id,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token_str,
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "secret_key": app_secret,
                },
            )
            return resp.json()
    except Exception as exc:
        logger.warning("Zalo token refresh failed: %s", exc)
        return {"error": -1, "message": str(exc)}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalise_phone(phone: str) -> str:
    """0912345678 → 84912345678  (Zalo ZNS format)."""
    p = phone.strip().lstrip("+").replace(" ", "").replace("-", "")
    if p.startswith("84"):
        return p
    if p.startswith("0"):
        return "84" + p[1:]
    return p
