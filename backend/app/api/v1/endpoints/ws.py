import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.security import decode_token
from app.services.ws_manager import manager

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    token: str = Query(...),
):
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception:
        await ws.close(code=4001)
        return

    await manager.connect(user_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, ws)
    except Exception:
        log.exception("Unexpected WebSocket error for user %s", user_id)
        manager.disconnect(user_id, ws)
