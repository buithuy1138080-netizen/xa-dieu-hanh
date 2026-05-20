"""Google Sheets API wrapper.

Graceful fallback if google-api-python-client is not installed —
endpoints still work; sync attempts return a clear error.
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    GOOGLE_LIBS_OK = True
except ImportError:
    GOOGLE_LIBS_OK = False
    logger.warning("google-api-python-client not installed — Google Sheets sync disabled")

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


# ── Internal helpers ──────────────────────────────────────────────────────────

def _build_service(credentials_json: str):
    if not GOOGLE_LIBS_OK:
        raise RuntimeError(
            "Thư viện google-api-python-client chưa được cài. "
            "Chạy: pip install google-api-python-client google-auth google-auth-httplib2"
        )
    creds_dict = json.loads(credentials_json)
    creds = service_account.Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def col_letter(n: int) -> str:
    """0-based index → column letter. 0→A, 25→Z, 26→AA."""
    result = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        result = chr(65 + r) + result
    return result


def col_index(col: str) -> int:
    """Column letter → 0-based index. A→0, Z→25, AA→26."""
    col = col.upper().strip()
    result = 0
    for c in col:
        result = result * 26 + (ord(c) - 64)
    return result - 1


# ── Public API ────────────────────────────────────────────────────────────────

def check_connection(sheet_id: str, credentials_json: str) -> dict:
    """Test connectivity and return sheet metadata."""
    try:
        svc = _build_service(credentials_json)
        meta = (
            svc.spreadsheets()
            .get(spreadsheetId=sheet_id, fields="spreadsheetId,properties/title,sheets/properties/title")
            .execute()
        )
        tabs = [s["properties"]["title"] for s in meta.get("sheets", [])]
        return {"ok": True, "title": meta["properties"]["title"], "tabs": tabs}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def read_sheet(
    sheet_id: str,
    tab: str,
    data_range: str,
    credentials_json: str,
) -> list[dict[str, str]]:
    """Read sheet rows.  Returns list of dicts keyed by column letter (A, B, …)."""
    try:
        svc = _build_service(credentials_json)
        range_notation = f"'{tab}'!{data_range}"
        result = (
            svc.spreadsheets()
            .values()
            .get(
                spreadsheetId=sheet_id,
                range=range_notation,
                valueRenderOption="UNFORMATTED_VALUE",
            )
            .execute()
        )
        rows = result.get("values", [])
        if not rows:
            return []

        max_cols = max((len(r) for r in rows), default=0)
        letters = [col_letter(i) for i in range(max_cols)]

        out = []
        for row in rows:
            d: dict[str, str] = {}
            for i, letter in enumerate(letters):
                d[letter] = str(row[i]).strip() if i < len(row) else ""
            out.append(d)
        return out
    except Exception as exc:
        logger.error("read_sheet sheet_id=%s tab=%s error: %s", sheet_id, tab, exc)
        raise RuntimeError(f"Không thể đọc Google Sheet '{tab}': {exc}") from exc


def write_rows(
    sheet_id: str,
    tab: str,
    updates: list[tuple[int, list[Any]]],
    credentials_json: str,
) -> int:
    """Update specific rows.  updates = [(row_index_1based, [colA, colB, …])]"""
    if not updates:
        return 0
    try:
        svc = _build_service(credentials_json)
        data = [
            {"range": f"'{tab}'!A{row_idx}", "values": [values]}
            for row_idx, values in updates
        ]
        svc.spreadsheets().values().batchUpdate(
            spreadsheetId=sheet_id,
            body={"valueInputOption": "USER_ENTERED", "data": data},
        ).execute()
        return len(updates)
    except Exception as exc:
        logger.error("write_rows sheet_id=%s tab=%s error: %s", sheet_id, tab, exc)
        raise RuntimeError(f"Không thể ghi Google Sheet '{tab}': {exc}") from exc


def append_rows(
    sheet_id: str,
    tab: str,
    data_range: str,
    rows: list[list[Any]],
    credentials_json: str,
) -> int:
    """Append rows after the last used row."""
    if not rows:
        return 0
    try:
        svc = _build_service(credentials_json)
        svc.spreadsheets().values().append(
            spreadsheetId=sheet_id,
            range=f"'{tab}'!{data_range}",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": rows},
        ).execute()
        return len(rows)
    except Exception as exc:
        logger.error("append_rows sheet_id=%s tab=%s error: %s", sheet_id, tab, exc)
        raise RuntimeError(f"Không thể thêm dòng vào Google Sheet '{tab}': {exc}") from exc


def clear_and_write(
    sheet_id: str,
    tab: str,
    data_range: str,
    rows: list[list[Any]],
    credentials_json: str,
) -> int:
    """Clear the range then write all rows (used for full push)."""
    if not rows:
        return 0
    try:
        svc = _build_service(credentials_json)
        svc.spreadsheets().values().clear(
            spreadsheetId=sheet_id,
            range=f"'{tab}'!{data_range}",
        ).execute()
        svc.spreadsheets().values().update(
            spreadsheetId=sheet_id,
            range=f"'{tab}'!A2",
            valueInputOption="USER_ENTERED",
            body={"values": rows},
        ).execute()
        return len(rows)
    except Exception as exc:
        logger.error("clear_and_write sheet_id=%s tab=%s error: %s", sheet_id, tab, exc)
        raise RuntimeError(f"Không thể ghi toàn bộ Google Sheet '{tab}': {exc}") from exc
