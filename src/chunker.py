from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


def chunk_text(
    text: str,
    row: dict[str, Any],
    chunk_size: int = 2000,
    chunk_overlap: int = 200,
) -> list[dict[str, Any]]:
    """Character-based chunking with page markers retained in metadata."""
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    paper_id = str(row.get("paper_id") or "")
    title = str(row.get("title") or "")
    doi = str(row.get("doi") or "")

    chunks: list[dict[str, Any]] = []
    start = 0
    chunk_index = 0
    text_length = len(text)

    while start < text_length:
        end = min(start + chunk_size, text_length)
        if end < text_length:
            boundary = max(text.rfind("\n", start, end), text.rfind(". ", start, end))
            if boundary > start + chunk_size // 2:
                end = boundary + 1
        chunk_body = text[start:end].strip()
        if chunk_body:
            chunk_id = f"{paper_id}_chunk_{chunk_index:04d}"
            chunks.append(
                {
                    "paper_id": paper_id,
                    "title": title,
                    "doi": doi,
                    "chunk_id": chunk_id,
                    "page_range": _page_range(chunk_body),
                    "text": chunk_body,
                }
            )
            chunk_index += 1
        if end >= text_length:
            break
        start = max(0, end - chunk_overlap)

    return chunks


def save_chunks(chunks: list[dict[str, Any]], chunk_dir: str | Path, paper_id: str) -> Path:
    Path(chunk_dir).mkdir(parents=True, exist_ok=True)
    output = Path(chunk_dir) / f"{paper_id}.jsonl"
    with output.open("w", encoding="utf-8") as handle:
        for chunk in chunks:
            handle.write(json.dumps(chunk, ensure_ascii=False) + "\n")
    return output


def _page_range(text: str) -> str:
    pages = [int(value) for value in re.findall(r"\[PAGE\s+(\d+)\]", text)]
    if not pages:
        return ""
    return f"{min(pages)}-{max(pages)}" if min(pages) != max(pages) else str(pages[0])

