"""AI Assistant Orchestrator — Groq (primary) + Gemini (fallback).

Token budget:
  - System prompt  : ~40 tokens
  - History        : last 8 messages
  - Tool results   : max 2500 chars each
  - max_output     : 800 tokens
  → ~300-600 tokens/request typical

Providers (in order of preference):
  1. Groq  — free 14,400 req/day, Llama-3.3-70b, OpenAI-compatible
  2. Gemini — free 1,500 req/day (gemini-2.0-flash)
"""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── System Prompt ────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "Trợ lý IOC xã Bắc Hà. Chỉ dùng dữ liệu từ tools. Không bịa số liệu. "
    "Trả lời tiếng Việt, ngắn gọn. Nếu không có dữ liệu → 'Hệ thống chưa có dữ liệu này'. "
    "Ghi nguồn: 'Dữ liệu IOC đến [ngày]'. "
    "Nhiệm vụ: Tổng|Hoàn thành|Đang thực hiện|Quá hạn|Nguy cơ chậm."
)

_MAX_TOOL_ROUNDS = 5
_MAX_HISTORY_MSG = 8


# ── Tool Execution ───────────────────────────────────────────────────────────

async def _execute_tool(name: str, args: dict, db: AsyncSession) -> str:
    from app.services.ai_tools import TOOL_REGISTRY
    fn = TOOL_REGISTRY.get(name)
    if fn is None:
        return json.dumps({"loi": f"Công cụ '{name}' không tồn tại"}, ensure_ascii=False)
    try:
        return await fn(db=db, **args)
    except Exception as exc:
        logger.exception("Tool %s failed with args %s", name, args)
        return json.dumps({"loi": f"Lỗi thực thi {name}: {exc}"}, ensure_ascii=False)


# ── Gemini tool format → OpenAI tool format ──────────────────────────────────

def _to_openai_tool(decl: dict) -> dict:
    """Convert Gemini FunctionDeclaration dict to OpenAI tools format."""
    _SKIP_KEYS = {"default"}  # not supported in OpenAI function calling schema

    def _norm(obj: Any) -> Any:
        if isinstance(obj, dict):
            result = {}
            for k, v in obj.items():
                if k in _SKIP_KEYS:
                    continue
                result[k] = v.lower() if k == "type" and isinstance(v, str) else _norm(v)
            return result
        if isinstance(obj, list):
            return [_norm(i) for i in obj]
        return obj

    params = _norm(decl.get("parameters", {}))
    # Ensure required array exists (some models need it even if empty)
    if "properties" in params and "required" not in params:
        params["required"] = []

    return {
        "type": "function",
        "function": {
            "name": decl["name"],
            "description": decl.get("description", ""),
            "parameters": params,
        },
    }


# ── Groq Provider ────────────────────────────────────────────────────────────

async def _chat_groq(
    user_message: str,
    history: list[dict],
    db: AsyncSession,
) -> tuple[str, list[str], int, int]:
    from groq import AsyncGroq
    from app.core.config import settings
    from app.services.ai_tools import GEMINI_TOOL_DECLARATIONS

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    tools = [_to_openai_tool(d) for d in GEMINI_TOOL_DECLARATIONS]

    messages: list[dict] = [{"role": "system", "content": _SYSTEM_PROMPT}]
    for msg in history[-_MAX_HISTORY_MSG:]:
        role = "user" if msg["role"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})

    tools_used: list[str] = []
    in_tok = out_tok = 0

    for _ in range(_MAX_TOOL_ROUNDS):
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            max_tokens=800,
            temperature=0.3,
        )

        if response.usage:
            in_tok += response.usage.prompt_tokens or 0
            out_tok += response.usage.completion_tokens or 0

        choice = response.choices[0]
        ai_msg = choice.message

        if not ai_msg.tool_calls:
            return (ai_msg.content or "").strip(), tools_used, in_tok, out_tok

        # Append assistant turn (with tool_calls)
        messages.append({
            "role": "assistant",
            "content": ai_msg.content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in ai_msg.tool_calls
            ],
        })

        # Execute each tool call and append results
        for tc in ai_msg.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments)
            except Exception:
                args = {}
            tools_used.append(name)
            logger.info("Groq calling tool: %s(%s)", name, args)
            result = await _execute_tool(name, args, db)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

    return "Xin lỗi, tôi không thể xử lý yêu cầu này lúc này.", tools_used, in_tok, out_tok


# ── Gemini Provider ──────────────────────────────────────────────────────────

async def _chat_gemini(
    user_message: str,
    history: list[dict],
    db: AsyncSession,
) -> tuple[str, list[str], int, int]:
    from google import genai as _genai
    from app.core.config import settings
    from app.services.ai_tools import GEMINI_TOOL_DECLARATIONS

    if not settings.GEMINI_API_KEY:
        raise ValueError("Trợ lý AI tạm thời không khả dụng, vui lòng thử lại sau")

    client = _genai.Client(api_key=settings.GEMINI_API_KEY)

    recent = history[-_MAX_HISTORY_MSG:]
    contents: list[Any] = []
    for msg in recent:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(_genai.types.Content(
            role=role,
            parts=[_genai.types.Part.from_text(text=msg["content"])],
        ))
    contents.append(_genai.types.Content(
        role="user",
        parts=[_genai.types.Part.from_text(text=user_message)],
    ))

    tool_config = _genai.types.Tool(
        function_declarations=[
            _genai.types.FunctionDeclaration(**decl) for decl in GEMINI_TOOL_DECLARATIONS
        ]
    )

    tools_used: list[str] = []
    in_tok = out_tok = 0

    for _ in range(_MAX_TOOL_ROUNDS):
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=contents,
            config=_genai.types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                tools=[tool_config],
                temperature=0.3,
                max_output_tokens=800,
            ),
        )

        if hasattr(response, "usage_metadata") and response.usage_metadata:
            in_tok += getattr(response.usage_metadata, "prompt_token_count", 0) or 0
            out_tok += getattr(response.usage_metadata, "candidates_token_count", 0) or 0

        candidate = response.candidates[0] if response.candidates else None
        if not candidate:
            break

        function_calls = [
            p.function_call for p in candidate.content.parts
            if hasattr(p, "function_call") and p.function_call
        ]

        if not function_calls:
            text_parts = [
                p.text for p in candidate.content.parts
                if hasattr(p, "text") and p.text
            ]
            return "\n".join(text_parts).strip(), tools_used, in_tok, out_tok

        fn_response_parts: list[Any] = []
        for fc in function_calls:
            tool_name = fc.name
            tool_args = dict(fc.args) if fc.args else {}
            tools_used.append(tool_name)
            logger.info("Gemini calling tool: %s(%s)", tool_name, tool_args)
            result_str = await _execute_tool(tool_name, tool_args, db)
            fn_response_parts.append(
                _genai.types.Part.from_function_response(
                    name=tool_name,
                    response={"result": result_str},
                )
            )

        contents.append(candidate.content)
        contents.append(_genai.types.Content(role="user", parts=fn_response_parts))

    return "Xin lỗi, tôi không thể xử lý yêu cầu này lúc này.", tools_used, in_tok, out_tok


# ── Main Orchestrator ────────────────────────────────────────────────────────

async def chat(
    user_message: str,
    history: list[dict[str, str]],
    db: AsyncSession,
) -> tuple[str, list[str], int, int]:
    """Run one conversation turn. Prefers Groq; falls back to Gemini."""
    from app.core.config import settings

    if settings.GROQ_API_KEY:
        try:
            return await _chat_groq(user_message, history, db)
        except Exception as exc:
            logger.warning("Groq failed (%s), falling back to Gemini", exc)

    return await _chat_gemini(user_message, history, db)


# ── Session helpers ──────────────────────────────────────────────────────────

async def get_session_history(session_id: int, db: AsyncSession) -> list[dict[str, str]]:
    from app.models.ai_chat import AiChatMessage
    from sqlalchemy import select
    rows = (await db.execute(
        select(AiChatMessage)
        .where(AiChatMessage.session_id == session_id)
        .order_by(AiChatMessage.id)
        .limit(_MAX_HISTORY_MSG)
    )).scalars().all()
    return [{"role": r.role, "content": r.content} for r in rows
            if r.role in ("user", "assistant")]


def auto_title(first_message: str) -> str:
    title = first_message.strip()[:60]
    return title + ("…" if len(first_message) > 60 else "")
