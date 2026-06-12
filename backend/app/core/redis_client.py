"""Redis cache helper — gracefully disabled when Redis is unavailable."""
import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

_redis: Any = None
_redis_unavailable = False


async def _get_redis():
    global _redis, _redis_unavailable
    if _redis_unavailable:
        return None
    if _redis is not None:
        return _redis
    try:
        import redis.asyncio as aioredis
        from app.core.config import settings
        client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        await client.ping()
        _redis = client
        logger.info("Redis cache connected: %s", settings.REDIS_URL)
        return _redis
    except Exception as exc:
        _redis_unavailable = True
        logger.warning("Redis not available (%s) — dashboard cache disabled", exc)
        return None


async def cache_get(key: str) -> Optional[Any]:
    r = await _get_redis()
    if r is None:
        return None
    try:
        val = await r.get(key)
        return json.loads(val) if val else None
    except Exception:
        return None


async def cache_set(key: str, value: Any, ttl: int = 60) -> None:
    r = await _get_redis()
    if r is None:
        return
    try:
        await r.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception:
        pass


async def cache_delete(key: str) -> None:
    r = await _get_redis()
    if r is None:
        return
    try:
        await r.delete(key)
    except Exception:
        pass


async def cache_delete_pattern(pattern: str) -> None:
    r = await _get_redis()
    if r is None:
        return
    try:
        keys = await r.keys(pattern)
        if keys:
            await r.delete(*keys)
    except Exception:
        pass
