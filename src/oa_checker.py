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


def _unpaywall_pdf_url(doi: str, timeout: int) -> tuple[str, str]:
    email = os.getenv("UNPAYWALL_EMAIL", "unconfigured@example.com")
    response = requests.get(UNPAYWALL_URL.format(doi=doi), params={"email": email}, timeout=timeout)
    if response.status_code == 404:
        return "", "Unpaywall DOI not found"
    response.raise_for_status()
    data = response.json()
    if not data.get("is_oa"):
        return "", "Not open access according to Unpaywall"

    best = data.get("best_oa_location") or {}
    pdf_url = _normalize_pdf_url(best.get("url_for_pdf"))
    if pdf_url:
        return pdf_url, ""
    for location in data.get("oa_locations") or []:
        pdf_url = _normalize_pdf_url(location.get("url_for_pdf"))
        if pdf_url:
            return pdf_url, ""
    return "", "Open access but no public PDF URL found"


def attach_open_access_urls(
    metadata: pd.DataFrame,
    timeout: int = 30,
) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    """Resolve public OA PDF URLs through Unpaywall first, then OpenAlex data."""
    resolved_rows: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for row in metadata.to_dict("records"):
        doi = str(row.get("doi") or "").strip()
        pdf_url = ""
        reason = ""

        if doi:
            try:
                pdf_url, reason = _unpaywall_pdf_url(doi, timeout=timeout)
            except requests.RequestException as exc:
                reason = f"Unpaywall request failed: {exc}"
        else:
            reason = "Missing DOI; using OpenAlex OA URL fallback"

        if not pdf_url:
            pdf_url = _normalize_pdf_url(row.get("openalex_pdf_url"))
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

