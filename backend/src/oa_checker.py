from __future__ import annotations

import os
from typing import Any

import pandas as pd
import requests


UNPAYWALL_URL = "https://api.unpaywall.org/v2/{doi}"


def _normalize_pdf_url(url: str | None) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    return url


def find_unpaywall_pdf_urls(doi: str, timeout: int) -> tuple[list[str], str]:
    email = os.getenv("UNPAYWALL_EMAIL", "unconfigured@example.com")
    response = requests.get(UNPAYWALL_URL.format(doi=doi), params={"email": email}, timeout=timeout)
    if response.status_code == 404:
        return [], "Unpaywall DOI not found"
    response.raise_for_status()
    data = response.json()
    if not data.get("is_oa"):
        return [], "Not open access according to Unpaywall"

    urls: list[str] = []
    best = data.get("best_oa_location") or {}
    pdf_url = _normalize_pdf_url(best.get("url_for_pdf"))
    if pdf_url:
        urls.append(pdf_url)
    for location in data.get("oa_locations") or []:
        pdf_url = _normalize_pdf_url(location.get("url_for_pdf"))
        if pdf_url and pdf_url not in urls:
            urls.append(pdf_url)
    if urls:
        return urls, ""
    return [], "Open access but no public PDF URL found"


def find_unpaywall_pdf_url(doi: str, timeout: int) -> tuple[str, str]:
    urls, reason = find_unpaywall_pdf_urls(doi, timeout)
    return (urls[0] if urls else ""), reason


def attach_open_access_urls(
    metadata: pd.DataFrame,
    timeout: int = 30,
    prefer_openalex: bool = False,
) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    """Resolve public OA PDF URLs through OpenAlex and Unpaywall."""
    resolved_rows: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for row in metadata.to_dict("records"):
        doi = str(row.get("doi") or "").strip()
        pdf_url = ""
        reason = ""

        if prefer_openalex:
            pdf_url = _normalize_pdf_url(row.get("openalex_pdf_url"))
            if pdf_url:
                row["pdf_url_source"] = "openalex"

        if not pdf_url and doi:
            try:
                pdf_url, reason = find_unpaywall_pdf_url(doi, timeout=timeout)
                if pdf_url:
                    row["pdf_url_source"] = "unpaywall"
            except requests.RequestException as exc:
                reason = f"Unpaywall request failed: {exc}"
        elif not pdf_url:
            reason = "Missing DOI; using OpenAlex OA URL fallback"

        if not pdf_url:
            pdf_url = _normalize_pdf_url(row.get("openalex_pdf_url"))
            if pdf_url:
                row["pdf_url_source"] = "openalex"
            if not pdf_url and row.get("openalex_is_oa") and row.get("landing_page_url"):
                reason = "Open access landing page found, but no direct PDF URL"

        row["pdf_url"] = pdf_url
        if pdf_url:
            resolved_rows.append(row)
        else:
            skipped.append(
                {
                    "paper_id": row.get("paper_id"),
                    "title": row.get("title"),
                    "doi": doi,
                    "stage": "oa_check",
                    "reason": reason or "No open-access PDF URL found",
                }
            )

    return pd.DataFrame(resolved_rows), skipped

