from __future__ import annotations

import json
import re
from bisect import bisect_right
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
    page_markers = [
        (match.start(), int(match.group(1)))
        for match in re.finditer(r"\[PAGE\s+(\d+)\]", text)
    ]
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
            page_range, page_start, page_end = _page_metadata(page_markers, start, end)
            chunks.append(
                {
                    "paper_id": paper_id,
                    "title": title,
                    "doi": doi,
                    "chunk_id": chunk_id,
                    "page_range": page_range,
                    "page_start": page_start,
                    "page_end": page_end,
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


def _page_metadata(
    page_markers: list[tuple[int, int]],
    start: int,
    end: int,
) -> tuple[str, int | None, int | None]:
    """Return pages intersecting a source span, including spans after a page marker."""
    if not page_markers:
        return "", None, None

    positions = [position for position, _ in page_markers]
    start_index = bisect_right(positions, start) - 1
    end_index = bisect_right(positions, max(start, end - 1)) - 1
    if end_index < 0:
        return "", None, None

    start_index = max(start_index, 0)
    start_page = page_markers[start_index][1]
    end_page = page_markers[max(end_index, start_index)][1]
    page_range = str(start_page) if start_page == end_page else f"{start_page}-{end_page}"
    return page_range, start_page, end_page

