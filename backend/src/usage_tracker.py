from __future__ import annotations

from collections import defaultdict
from typing import Any


_USAGE: dict[str, int] = defaultdict(int)


def add_usage(stage: str, model: str, usage: Any) -> None:
    """Accumulate OpenAI token usage from Responses, Chat Completions, or Embeddings."""
    if not usage:
        return
    prefix = f"{stage}:{model}"
    values = _usage_to_dict(usage)
    input_tokens = values.get("input_tokens", values.get("prompt_tokens", 0)) or 0
    output_tokens = values.get("output_tokens", values.get("completion_tokens", 0)) or 0
    total_tokens = values.get("total_tokens", input_tokens + output_tokens) or 0

    _USAGE[f"{prefix}:input_tokens"] += int(input_tokens)
    _USAGE[f"{prefix}:output_tokens"] += int(output_tokens)
    _USAGE[f"{prefix}:total_tokens"] += int(total_tokens)


def summary() -> dict[str, int]:
    return dict(_USAGE)


def totals() -> dict[str, int]:
    input_tokens = sum(value for key, value in _USAGE.items() if key.endswith(":input_tokens"))
    output_tokens = sum(value for key, value in _USAGE.items() if key.endswith(":output_tokens"))
    total_tokens = sum(value for key, value in _USAGE.items() if key.endswith(":total_tokens"))
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def _usage_to_dict(usage: Any) -> dict[str, Any]:
    if isinstance(usage, dict):
        return usage
    if hasattr(usage, "model_dump"):
        return usage.model_dump()
    values: dict[str, Any] = {}
    for key in ("input_tokens", "output_tokens", "prompt_tokens", "completion_tokens", "total_tokens"):
        if hasattr(usage, key):
            values[key] = getattr(usage, key)
    return values

