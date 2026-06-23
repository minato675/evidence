from __future__ import annotations

import os
from typing import Any

import pandas as pd
import requests


OPENALEX_WORKS_URL = "https://api.openalex.org/works"


def _abstract_from_inverted_index(index: dict[str, list[int]] | None) -> str:
    if not index:
        return ""
    positioned: list[tuple[int, str]] = []
    for word, positions in index.items():
        positioned.extend((pos, word) for pos in positions)
    return " ".join(word for _, word in sorted(positioned))


def _safe_openalex_id(value: str | None) -> str:
    if not value:
        return ""
    return value.rstrip("/").split("/")[-1]


def search_openalex(
    topic: str,
    max_papers: int,
    output_path: str,
    timeout: int = 30,
    user_agent: str | None = None,
    exclude_terms: list[str] | None = None,
    require_terms: list[str] | None = None,
) -> pd.DataFrame:
    """Search OpenAlex and save normalized paper metadata."""
    headers = {"User-Agent": user_agent or "paper-mining-project/0.1"}
    params: dict[str, Any] = {
        "search": topic,
        "filter": "type:article",
        "per-page": min(max(max_papers * 5, 1), 200),
        "sort": "relevance_score:desc",
    }
    mailto = os.getenv("OPENALEX_MAILTO")
    if mailto:
        params["mailto"] = mailto

    response = requests.get(OPENALEX_WORKS_URL, params=params, headers=headers, timeout=timeout)
    response.raise_for_status()
    works = response.json().get("results", [])

    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for work in works:
        doi = (work.get("doi") or "").replace("https://doi.org/", "").strip().lower()
        openalex_id = _safe_openalex_id(work.get("id"))
        abstract = _abstract_from_inverted_index(work.get("abstract_inverted_index"))
        combined_text = f"{work.get('title') or ''} {abstract}".lower()
        if exclude_terms and any(term.lower() in combined_text for term in exclude_terms):
            continue
        if require_terms and not any(term.lower() in combined_text for term in require_terms):
            continue
        dedupe_key = doi or openalex_id
        if not dedupe_key or dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        authorships = work.get("authorships") or []
        authors = [
            item.get("author", {}).get("display_name", "")
            for item in authorships
            if item.get("author", {}).get("display_name")
        ]
        best_oa = work.get("best_oa_location") or {}
        primary = work.get("primary_location") or {}
        rows.append(
            {
                "paper_id": openalex_id or doi.replace("/", "_"),
                "openalex_id": openalex_id,
                "title": work.get("title") or "",
                "doi": doi,
                "abstract": abstract,
                "authors": "; ".join(authors),
                "year": work.get("publication_year"),
                "landing_page_url": (primary.get("landing_page_url") or work.get("id") or ""),
                "openalex_pdf_url": best_oa.get("pdf_url") or "",
                "openalex_is_oa": bool(work.get("open_access", {}).get("is_oa")),
                "cited_by_count": work.get("cited_by_count"),
            }
        )
        if len(rows) >= max_papers:
            break

    df = pd.DataFrame(rows)
    if not df.empty:
        df.to_csv(output_path, index=False, encoding="utf-8-sig")
    return df
