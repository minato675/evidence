from __future__ import annotations

import os
import json
import time
from collections.abc import Iterator
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
    """Search OpenAlex with cursor paging until the requested result count is reached."""
    page_size = min(max(max_papers * 5, 1), 200)
    frames = [
        frame
        for frame, _, _ in iter_openalex_pages(
            topic=topic,
            timeout=timeout,
            user_agent=user_agent,
            exclude_terms=exclude_terms,
            require_terms=require_terms,
            per_page=page_size,
            max_results=max_papers,
        )
        if not frame.empty
    ]
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    if not df.empty:
        df.to_csv(output_path, index=False, encoding="utf-8-sig")
    return df


def iter_openalex_pages(
    topic: str,
    timeout: int = 30,
    user_agent: str | None = None,
    exclude_terms: list[str] | None = None,
    require_terms: list[str] | None = None,
    only_open_access: bool = False,
    journal_only: bool = False,
    per_page: int = 200,
    start_cursor: str = "*",
    max_results: int | None = None,
    request_delay: float = 0.1,
    from_year: int | None = None,
    to_year: int | None = None,
) -> Iterator[tuple[pd.DataFrame, str | None, dict[str, Any]]]:
    """Yield normalized OpenAlex result pages using cursor pagination."""
    headers = {"User-Agent": user_agent or "paper-mining-project/0.1"}
    filters = ["type:article"]
    if only_open_access:
        filters.append("is_oa:true")
    if journal_only:
        filters.append("primary_location.source.type:journal")
    if from_year is not None:
        filters.append(f"from_publication_date:{from_year}-01-01")
    if to_year is not None:
        filters.append(f"to_publication_date:{to_year}-12-31")
    params: dict[str, Any] = {
        "search": topic,
        "filter": ",".join(filters),
        "per-page": min(max(per_page, 1), 200),
        "sort": "relevance_score:desc",
        "cursor": start_cursor,
    }
    mailto = os.getenv("OPENALEX_MAILTO")
    if mailto:
        params["mailto"] = mailto

    seen: set[str] = set()
    yielded = 0
    cursor = start_cursor

    while cursor:
        params["cursor"] = cursor
        data = _request_openalex(params, headers, timeout)
        works = data.get("results") or []
        page_rows: list[dict[str, Any]] = []
        limit_reached = False

        for work in works:
            row = _normalize_work(work)
            combined_text = f"{row['title']} {row['abstract']}".lower()
            if exclude_terms and any(term.casefold() in combined_text.casefold() for term in exclude_terms):
                continue
            if require_terms and not any(term.casefold() in combined_text.casefold() for term in require_terms):
                continue
            dedupe_key = row["doi"] or row["openalex_id"]
            if not dedupe_key or dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            page_rows.append(row)
            yielded += 1
            if max_results is not None and yielded >= max_results:
                limit_reached = True
                break

        meta = dict(data.get("meta") or {})
        meta["limit_reached"] = limit_reached
        next_cursor = meta.get("next_cursor")
        yield pd.DataFrame(page_rows), next_cursor, meta

        if limit_reached or not works or not next_cursor or next_cursor == cursor:
            break
        cursor = str(next_cursor)
        if request_delay > 0:
            time.sleep(request_delay)


def _request_openalex(
    params: dict[str, Any],
    headers: dict[str, str],
    timeout: int,
    attempts: int = 5,
) -> dict[str, Any]:
    """Request one OpenAlex page, retrying rate limits and transient server errors."""
    for attempt in range(attempts):
        try:
            response = requests.get(OPENALEX_WORKS_URL, params=params, headers=headers, timeout=timeout)
        except requests.RequestException:
            if attempt == attempts - 1:
                raise
            time.sleep(min(2**attempt, 30))
            continue
        if response.status_code != 429 and response.status_code < 500:
            response.raise_for_status()
            return response.json()
        if attempt == attempts - 1:
            response.raise_for_status()
        retry_after = response.headers.get("Retry-After")
        delay = float(retry_after) if retry_after and retry_after.isdigit() else min(2**attempt, 30)
        time.sleep(delay)
    raise RuntimeError("OpenAlex request retry loop ended unexpectedly")


def _normalize_work(work: dict[str, Any]) -> dict[str, Any]:
    doi = (work.get("doi") or "").replace("https://doi.org/", "").strip().lower()
    openalex_id = _safe_openalex_id(work.get("id"))
    abstract = _abstract_from_inverted_index(work.get("abstract_inverted_index"))
    authorships = work.get("authorships") or []
    authors = [
        item.get("author", {}).get("display_name", "")
        for item in authorships
        if item.get("author", {}).get("display_name")
    ]
    best_oa = work.get("best_oa_location") or {}
    primary = work.get("primary_location") or {}
    source = primary.get("source") or {}
    open_access = work.get("open_access") or {}
    oa_pdf_urls: list[str] = []
    for location in [best_oa, primary, *(work.get("locations") or [])]:
        pdf_url = str((location or {}).get("pdf_url") or "").strip()
        if pdf_url and pdf_url not in oa_pdf_urls:
            oa_pdf_urls.append(pdf_url)
    return {
        "paper_id": openalex_id or doi.replace("/", "_"),
        "openalex_id": openalex_id,
        "title": work.get("title") or "",
        "doi": doi,
        "abstract": abstract,
        "authors": "; ".join(authors),
        "year": work.get("publication_year"),
        "publication_date": work.get("publication_date"),
        "journal": source.get("display_name") or "",
        "source_type": source.get("type") or "",
        "landing_page_url": primary.get("landing_page_url") or work.get("id") or "",
        "openalex_pdf_url": oa_pdf_urls[0] if oa_pdf_urls else "",
        "oa_pdf_urls": json.dumps(oa_pdf_urls, ensure_ascii=False),
        "publisher_pdf_url": "",
        "openalex_is_oa": bool(open_access.get("is_oa")),
        "oa_status": open_access.get("oa_status") or "",
        "oa_license": best_oa.get("license") or primary.get("license") or "",
        "cited_by_count": work.get("cited_by_count"),
        "publisher": source.get("host_organization_name") or "",
        "metadata_provider": "openalex",
    }
