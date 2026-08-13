from __future__ import annotations

from pathlib import Path
from typing import Any

import pymupdf as fitz


def parse_pdf_to_text(
    pdf_path: str | Path,
    row: dict[str, Any],
    text_dir: str | Path,
    min_chars: int = 500,
) -> tuple[Path | None, dict[str, Any] | None]:
    """Extract page-level text with simple page markers."""
    text_path = Path(text_dir)
    text_path.mkdir(parents=True, exist_ok=True)
    paper_id = str(row.get("paper_id") or Path(pdf_path).stem)
    output = text_path / f"{paper_id}.txt"

    try:
        document = fitz.open(pdf_path)
        pages: list[str] = []
        for index, page in enumerate(document, start=1):
            page_text = page.get_text("text") or ""
            pages.append(f"\n[PAGE {index}]\n{page_text.strip()}\n")
        text = "\n".join(pages).strip()
    except Exception as exc:  # PyMuPDF raises multiple exception types.
        return None, _skip(row, "pdf_parse", f"PDF text extraction failed: {exc}")

    if len(text) < min_chars:
        return None, _skip(row, "pdf_parse", "Extracted text is too short")

    output.write_text(text, encoding="utf-8")
    return output, None


def _skip(row: dict[str, Any], stage: str, reason: str) -> dict[str, Any]:
    return {
        "paper_id": row.get("paper_id"),
        "title": row.get("title"),
        "doi": row.get("doi"),
        "stage": stage,
        "reason": reason,
    }

