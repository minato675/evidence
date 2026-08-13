from __future__ import annotations

import html
import os
import re
import time
from collections.abc import Iterator
from typing import Any

import pandas as pd
import requests


CROSSREF_WORKS_URL = "https://api.crossref.org/works"


def iter_crossref_pages(
    topic: str,
    timeout: int = 30,
    user_agent: str | None = None,
    exclude_terms: list[str] | None = None,
    require_terms: list[str] | None = None,
    rows: int = 1000,
    start_cursor: str = "*",
    max_results: int | None = None,
    request_delay: float = 0.1,
    from_year: int | None = None,
    to_year: int | None = None,
) -> Iterator[tuple[pd.DataFrame, str | None, dict[str, Any]]]:
    """Yield Crossref journal-article metadata pages using cursor pagination."""
    mailto = os.getenv("CROSSREF_MAILTO") or os.getenv("OPENALEX_MAILTO")
    headers = {"User-Agent": user_agent or "paper-mining-project/0.1"}
    filters = ["type:journal-article"]
    if from_year is not None:
        filters.append(f"from-pub-date:{from_year}-01-01")
    if to_year is not None:
        filters.append(f"until-pub-date:{to_year}-12-31")
    params: dict[str, Any] = {
        "query.bibliographic": topic,
        "filter": ",".join(filters),
        "rows": min(max(rows, 1), 1000),
        "cursor": start_cursor,
        "select": (
            "DOI,title,abstract,author,published,container-title,publisher,URL,link,type"
        ),
    }
    if mailto:
        params["mailto"] = mailto

    cursor = start_cursor
    yielded = 0
    seen: set[str] = set()
    while cursor:
        params["cursor"] = cursor
        message = _request_crossref(params, headers, timeout)
        items = message.get("items") or []
        page_rows: list[dict[str, Any]] = []
        limit_reached = False

        for item in items:
            row = _normalize_crossref_work(item)
            combined_text = f"{row['title']} {row['abstract']}".casefold()
            if exclude_terms and any(term.casefold() in combined_text for term in exclude_terms):
                continue
            if require_terms and not any(term.casefold() in combined_text for term in require_terms):
                continue
            doi = row["doi"]
            if not doi or doi in seen:
                continue
            seen.add(doi)
            page_rows.append(row)
            yielded += 1
            if max_results is not None and yielded >= max_results:
                limit_reached = True
                break

        next_cursor = message.get("next-cursor")
        meta = {
            "count": message.get("total-results"),
            "next_cursor": next_cursor,
            "limit_reached": limit_reached,
        }
        yield pd.DataFrame(page_rows), next_cursor, meta

        if limit_reached or not items or not next_cursor or next_cursor == cursor:
            break
        cursor = str(next_cursor)
        if request_delay > 0:
            time.sleep(request_delay)


def _request_crossref(
    params: dict[str, Any],
    headers: dict[str, str],
    timeout: int,
    attempts: int = 5,
) -> dict[str, Any]:
    for attempt in range(attempts):
        try:
            response = requests.get(CROSSREF_WORKS_URL, params=params, headers=headers, timeout=timeout)
        except requests.RequestException:
            if attempt == attempts - 1:
                raise
            time.sleep(min(2**attempt, 30))
            continue
        if response.status_code != 429 and response.status_code < 500:
            response.raise_for_status()
            return response.json().get("message") or {}
        if attempt == attempts - 1:
            response.raise_for_status()
        retry_after = response.headers.get("Retry-After")
        delay = float(retry_after) if retry_after and retry_after.isdigit() else min(2**attempt, 30)
        time.sleep(delay)
    raise RuntimeError("Crossref request retry loop ended unexpectedly")


def _normalize_crossref_work(item: dict[str, Any]) -> dict[str, Any]:
    doi = str(item.get("DOI") or "").strip().lower()
    title = _first(item.get("title"))
    abstract = _clean_jats(str(item.get("abstract") or ""))
    authors = []
    for author in item.get("author") or []:
        name = " ".join(part for part in [author.get("given"), author.get("family")] if part)
        if name:
            authors.append(name)
    date_parts = ((item.get("published") or {}).get("date-parts") or [[]])[0]
    year = date_parts[0] if date_parts else None
    links = item.get("link") or []
    pdf_url = next(
        (
            str(link.get("URL") or "")
            for link in links
            if "pdf" in str(link.get("content-type") or "").lower()
        ),
        "",
    )
    return {
        "paper_id": f"doi_{doi.replace('/', '_')}",
        "openalex_id": "",
        "title": title,
        "doi": doi,
        "abstract": abstract,
        "authors": "; ".join(authors),
        "year": year,
        "publication_date": "-".join(str(part) for part in date_parts),
        "journal": _first(item.get("container-title")),
        "source_type": "journal",
        "publisher": item.get("publisher") or "",
        "landing_page_url": item.get("URL") or "",
        "openalex_pdf_url": "",
        "oa_pdf_urls": "[]",
        "publisher_pdf_url": pdf_url,
        "openalex_is_oa": False,
        "oa_status": "",
        "oa_license": "",
        "cited_by_count": None,
        "metadata_provider": "crossref",
    }


def _first(value: Any) -> str:
    if isinstance(value, list):
        return str(value[0]) if value else ""
    return str(value or "")


def _clean_jats(value: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(without_tags)).strip()
