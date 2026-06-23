from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import requests


def safe_filename(identifier: str) -> str:
    identifier = identifier or "unknown"
    return re.sub(r"[^A-Za-z0-9._-]+", "_", identifier).strip("_")[:160]


def download_pdf(
    row: dict[str, Any],
    paper_dir: str | Path,
    timeout: int = 30,
    user_agent: str | None = None,
) -> tuple[Path | None, dict[str, Any] | None]:
    """Download a public PDF URL and return either a path or a skip record."""
    paper_path = Path(paper_dir)
    paper_path.mkdir(parents=True, exist_ok=True)

    paper_id = str(row.get("paper_id") or row.get("doi") or "unknown")
    target = paper_path / f"{safe_filename(paper_id)}.pdf"
    if target.exists() and target.stat().st_size > 0:
        return target, None

    pdf_url = str(row.get("pdf_url") or "")
    if not pdf_url:
        return None, _skip(row, "pdf_download", "Missing PDF URL")

    headers = {"User-Agent": user_agent or "paper-mining-project/0.1"}
    try:
        with requests.get(pdf_url, headers=headers, stream=True, timeout=timeout, allow_redirects=True) as response:
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "").lower()
            if "pdf" not in content_type and not pdf_url.lower().split("?")[0].endswith(".pdf"):
                return None, _skip(row, "pdf_download", f"URL did not return a PDF content type: {content_type}")
            with target.open("wb") as handle:
                for chunk in response.iter_content(chunk_size=1024 * 64):
                    if chunk:
                        handle.write(chunk)
    except requests.RequestException as exc:
        return None, _skip(row, "pdf_download", f"PDF download failed: {exc}")

    if target.stat().st_size < 1024:
        target.unlink(missing_ok=True)
        return None, _skip(row, "pdf_download", "Downloaded file is too small to be a valid PDF")
    return target, None


def _skip(row: dict[str, Any], stage: str, reason: str) -> dict[str, Any]:
    return {
        "paper_id": row.get("paper_id"),
        "title": row.get("title"),
        "doi": row.get("doi"),
        "stage": stage,
        "reason": reason,
    }

