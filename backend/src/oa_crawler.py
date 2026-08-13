from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterator

import pandas as pd
import requests

from .crossref_search import iter_crossref_pages
from .oa_checker import find_unpaywall_pdf_urls
from .paper_search import iter_openalex_pages
from .pdf_downloader import download_pdf


PageIterator = Iterator[tuple[pd.DataFrame, str | None, dict[str, Any]]]

METADATA_COLUMNS = [
    "paper_id",
    "openalex_id",
    "title",
    "doi",
    "abstract",
    "authors",
    "year",
    "publication_date",
    "journal",
    "source_type",
    "publisher",
    "landing_page_url",
    "openalex_pdf_url",
    "oa_pdf_urls",
    "publisher_pdf_url",
    "openalex_is_oa",
    "oa_status",
    "oa_license",
    "cited_by_count",
    "metadata_provider",
]
DOWNLOAD_COLUMNS = METADATA_COLUMNS + ["pdf_url", "pdf_url_source", "local_pdf_path", "download_status"]
SKIP_COLUMNS = ["paper_id", "title", "doi", "stage", "reason"]


def crawl_open_access_journals(
    topic: str,
    output_dir: str | Path,
    paper_dir: str | Path,
    providers: list[str] | None = None,
    timeout: int = 30,
    user_agent: str | None = None,
    exclude_terms: list[str] | None = None,
    require_terms: list[str] | None = None,
    max_results_per_provider: int | None = None,
    from_year: int | None = None,
    to_year: int | None = None,
    request_delay: float = 0.1,
    fresh: bool = False,
    logger: Any = None,
) -> dict[str, Any]:
    """Crawl matching OA journal articles from metadata APIs and public PDF URLs."""
    provider_names = [name.strip().lower() for name in (providers or ["openalex", "crossref"]) if name.strip()]
    unsupported = sorted(set(provider_names) - {"openalex", "crossref"})
    if unsupported:
        raise ValueError(f"Unsupported search providers: {', '.join(unsupported)}")

    query = {
        "topic": topic,
        "providers": provider_names,
        "exclude_terms": sorted(exclude_terms or []),
        "require_terms": sorted(require_terms or []),
        "max_results_per_provider": max_results_per_provider,
        "from_year": from_year,
        "to_year": to_year,
    }
    crawl_dir = _crawl_directory(output_dir, topic, query)
    crawl_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "state": crawl_dir / "crawl_state.json",
        "metadata": crawl_dir / "metadata.csv",
        "downloaded": crawl_dir / "downloaded_papers.csv",
        "skipped": crawl_dir / "skipped_papers.csv",
        "summary": crawl_dir / "crawl_summary.json",
    }
    if fresh:
        for path in paths.values():
            path.unlink(missing_ok=True)

    state = _load_state(paths["state"], query, provider_names)
    seen = _load_seen(paths["metadata"])

    for provider in provider_names:
        provider_state = state["provider_state"][provider]
        if provider_state.get("complete"):
            _log(logger, "Provider already complete; resuming past %s", provider)
            continue

        remaining = max_results_per_provider
        if remaining is not None:
            remaining = max(remaining - int(provider_state.get("accepted", 0)), 0)
            if remaining == 0:
                provider_state["complete"] = True
                _write_json(paths["state"], state)
                continue

        pages = _provider_pages(
            provider=provider,
            topic=topic,
            start_cursor=str(provider_state.get("next_cursor") or "*"),
            timeout=timeout,
            user_agent=user_agent,
            exclude_terms=exclude_terms,
            require_terms=require_terms,
            max_results=remaining,
            request_delay=request_delay,
            from_year=from_year,
            to_year=to_year,
        )
        for frame, next_cursor, meta in pages:
            provider_state["pages"] = int(provider_state.get("pages", 0)) + 1
            frame = _drop_seen(frame, seen)
            if not frame.empty:
                _append_csv(frame, paths["metadata"], METADATA_COLUMNS)
                provider_state["accepted"] = int(provider_state.get("accepted", 0)) + len(frame)
                state["counts"]["metadata"] += len(frame)
                _remember(frame, seen)
                downloaded, skipped = _resolve_and_download(
                    frame,
                    provider,
                    paper_dir,
                    timeout,
                    user_agent,
                )
                _append_csv(downloaded, paths["downloaded"], DOWNLOAD_COLUMNS)
                _append_csv(pd.DataFrame(skipped), paths["skipped"], SKIP_COLUMNS)
                state["counts"]["downloaded"] += len(downloaded)
                state["counts"]["skipped"] += len(skipped)

            provider_state["next_cursor"] = next_cursor
            provider_state["total_candidates"] = meta.get("count")
            provider_state["complete"] = bool(meta.get("limit_reached") or not next_cursor)
            _write_json(paths["state"], state)
            _log(
                logger,
                "OA crawl provider=%s pages=%s accepted=%s downloaded_total=%s skipped_total=%s",
                provider,
                provider_state["pages"],
                provider_state["accepted"],
                state["counts"]["downloaded"],
                state["counts"]["skipped"],
            )
            if provider_state["complete"]:
                break

    state["complete"] = all(item.get("complete") for item in state["provider_state"].values())
    state["crawl_dir"] = str(crawl_dir)
    _write_json(paths["state"], state)
    _write_json(paths["summary"], state)
    return state


def _provider_pages(
    provider: str,
    topic: str,
    start_cursor: str,
    timeout: int,
    user_agent: str | None,
    exclude_terms: list[str] | None,
    require_terms: list[str] | None,
    max_results: int | None,
    request_delay: float,
    from_year: int | None,
    to_year: int | None,
) -> PageIterator:
    common = {
        "topic": topic,
        "timeout": timeout,
        "user_agent": user_agent,
        "exclude_terms": exclude_terms,
        "require_terms": require_terms,
        "start_cursor": start_cursor,
        "max_results": max_results,
        "request_delay": request_delay,
        "from_year": from_year,
        "to_year": to_year,
    }
    if provider == "openalex":
        return iter_openalex_pages(only_open_access=True, journal_only=True, per_page=200, **common)
    return iter_crossref_pages(rows=1000, **common)


def _resolve_and_download(
    frame: pd.DataFrame,
    provider: str,
    paper_dir: str | Path,
    timeout: int,
    user_agent: str | None,
) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    downloaded_rows: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for row in frame.to_dict("records"):
        urls = _openalex_candidates(row) if provider == "openalex" else []
        unpaywall_reason = ""
        if not urls and row.get("doi"):
            try:
                urls, unpaywall_reason = find_unpaywall_pdf_urls(str(row.get("doi")), timeout)
            except requests.RequestException as exc:
                unpaywall_reason = f"Unpaywall request failed: {exc}"
        if not urls:
            skipped.append(_skip(row, "oa_check", unpaywall_reason or "No public PDF URL found"))
            continue

        pdf_path, failure = _download_candidates(row, urls, paper_dir, timeout, user_agent)
        if failure and provider == "openalex" and row.get("doi"):
            try:
                fallback_urls, unpaywall_reason = find_unpaywall_pdf_urls(str(row.get("doi")), timeout)
            except requests.RequestException as exc:
                fallback_urls = []
                unpaywall_reason = f"Unpaywall fallback failed: {exc}"
            unused = [url for url in fallback_urls if url not in urls]
            if unused:
                pdf_path, failure = _download_candidates(row, unused, paper_dir, timeout, user_agent)
        if failure:
            if unpaywall_reason:
                failure["reason"] += f"; {unpaywall_reason}"
            skipped.append(failure)
            continue

        row["local_pdf_path"] = str(pdf_path)
        row["download_status"] = "downloaded"
        downloaded_rows.append(row)
    return pd.DataFrame(downloaded_rows), skipped


def _download_candidates(
    row: dict[str, Any],
    urls: list[str],
    paper_dir: str | Path,
    timeout: int,
    user_agent: str | None,
) -> tuple[Path | None, dict[str, Any] | None]:
    failures: list[str] = []
    last_failure: dict[str, Any] | None = None
    for url in urls:
        row["pdf_url"] = url
        row["pdf_url_source"] = "openalex" if url in _openalex_candidates(row) else "unpaywall"
        pdf_path, failure = download_pdf(row, paper_dir, timeout=timeout, user_agent=user_agent)
        if not failure:
            return pdf_path, None
        last_failure = failure
        failures.append(str(failure.get("reason") or "download failed"))
    if last_failure is None:
        return None, _skip(row, "pdf_download", "No PDF candidates supplied")
    last_failure["reason"] = " | ".join(failures)
    return None, last_failure


def _openalex_candidates(row: dict[str, Any]) -> list[str]:
    value = row.get("oa_pdf_urls")
    urls: list[str] = []
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                urls.extend(str(url).strip() for url in parsed if str(url).strip())
        except json.JSONDecodeError:
            pass
    primary = str(row.get("openalex_pdf_url") or "").strip()
    if primary and primary not in urls:
        urls.insert(0, primary)
    return list(dict.fromkeys(urls))


def _skip(row: dict[str, Any], stage: str, reason: str) -> dict[str, Any]:
    return {
        "paper_id": row.get("paper_id"),
        "title": row.get("title"),
        "doi": row.get("doi"),
        "stage": stage,
        "reason": reason,
    }


def _crawl_directory(output_dir: str | Path, topic: str, query: dict[str, Any]) -> Path:
    slug = re.sub(r"[^A-Za-z0-9가-힣]+", "-", topic).strip("-")[:48] or "query"
    digest = hashlib.sha256(json.dumps(query, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:10]
    return Path(output_dir) / "oa_crawls" / f"{slug}-{digest}"


def _load_state(path: Path, query: dict[str, Any], providers: list[str]) -> dict[str, Any]:
    if path.exists():
        state = json.loads(path.read_text(encoding="utf-8"))
        if state.get("query") != query:
            raise ValueError("Existing crawl state does not match the requested query")
        return state
    return {
        "version": 1,
        "query": query,
        "provider_state": {
            provider: {"next_cursor": "*", "pages": 0, "accepted": 0, "complete": False}
            for provider in providers
        },
        "counts": {"metadata": 0, "downloaded": 0, "skipped": 0},
        "complete": False,
    }


def _load_seen(path: Path) -> set[str]:
    if not path.exists() or path.stat().st_size == 0:
        return set()
    frame = pd.read_csv(path, usecols=lambda column: column in {"doi", "paper_id"})
    seen: set[str] = set()
    _remember(frame, seen)
    return seen


def _remember(frame: pd.DataFrame, seen: set[str]) -> None:
    for row in frame.to_dict("records"):
        key = str(row.get("doi") or row.get("paper_id") or "").strip().lower()
        if key:
            seen.add(key)


def _drop_seen(frame: pd.DataFrame, seen: set[str]) -> pd.DataFrame:
    if frame.empty:
        return frame
    keep = []
    for row in frame.to_dict("records"):
        key = str(row.get("doi") or row.get("paper_id") or "").strip().lower()
        keep.append(bool(key and key not in seen))
    return frame.loc[keep].reset_index(drop=True)


def _append_csv(frame: pd.DataFrame, path: Path, columns: list[str]) -> None:
    if frame.empty:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.reindex(columns=columns).to_csv(
        path,
        mode="a",
        header=not path.exists(),
        index=False,
        encoding="utf-8-sig",
    )


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def _log(logger: Any, message: str, *args: Any) -> None:
    if logger is not None:
        logger.info(message, *args)
