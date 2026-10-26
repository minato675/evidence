from __future__ import annotations

import re
from collections import Counter


def clean_text(text: str, include_references: bool = True) -> str:
    """Normalize extracted PDF text while keeping scientific content intact."""
    text = text.replace("\x00", " ")
    text = re.sub(r"-\n(?=[a-z])", "", text)
    text = re.sub(r"(?<!\n)\n(?!\[PAGE \d+\])", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)

    lines = [line.strip() for line in text.splitlines()]
    repeated = {
        line
        for line, count in Counter(lines).items()
        if count >= 3 and (len(line) < 120 or re.fullmatch(r"\d+", line or ""))
    }
    lines = [line for line in lines if line and line not in repeated and not _looks_like_copyright(line)]
    cleaned = "\n".join(lines)

    if not include_references:
        match = re.search(r"\n\s*(references|bibliography)\s*\n", cleaned, flags=re.IGNORECASE)
        if match:
            cleaned = cleaned[: match.start()].strip()

    return cleaned.strip()


def _looks_like_copyright(line: str) -> bool:
    low = line.lower()
    return "copyright" in low or "all rights reserved" in low or "creative commons" in low

