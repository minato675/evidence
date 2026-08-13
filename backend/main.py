from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import pandas as pd
import yaml
from dotenv import load_dotenv
from tqdm import tqdm

from src.chunker import chunk_text, save_chunks
from src.exporter import export_results
from src.extractor import LLMExtractor
from src.logger import setup_logger
from src.oa_checker import attach_open_access_urls
from src.oa_crawler import crawl_open_access_journals
from src.paper_search import search_openalex
from src.pdf_downloader import download_pdf
from src.pdf_parser import parse_pdf_to_text
from src.retriever import retrieve_field_contexts
from src.text_cleaner import clean_text
from src.validator import validate_extraction
from src.vector_store import VectorStore
from src.usage_tracker import summary as usage_summary
from src.usage_tracker import totals as usage_totals


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Open-access paper mining and LLM-RAG extraction pipeline")
    parser.add_argument("--topic", required=True, help="Research topic to search")
    parser.add_argument("--max_papers", type=int, default=None, help="Maximum number of papers to collect")
    parser.add_argument("--schema", default="configs/extraction_schema.yaml", help="Extraction schema YAML path")
    parser.add_argument("--settings", default="configs/settings.yaml", help="Settings YAML path")
    parser.add_argument(
        "--crawl_all_oa",
        action="store_true",
        help="Crawl all matching open-access journal articles without running embeddings or LLM extraction",
    )
    parser.add_argument(
        "--search_providers",
        default="openalex,crossref",
        help="Comma-separated metadata providers for OA crawling: openalex,crossref",
    )
    parser.add_argument(
        "--crawl_limit",
        type=int,
        default=None,
        help="Optional per-provider result cap for a small crawl test",
    )
    parser.add_argument(
        "--fresh_crawl",
        action="store_true",
        help="Start this crawl again instead of resuming its saved cursor",
    )
    parser.add_argument("--from_year", type=int, default=None, help="Earliest publication year to crawl")
    parser.add_argument("--to_year", type=int, default=None, help="Latest publication year to crawl")
    parser.add_argument(
        "--exclude_terms",
        default="",
        help="Comma-separated terms to exclude when found in title or abstract",
    )
    parser.add_argument(
        "--require_terms",
        default="",
        help="Comma-separated terms; at least one must appear in title or abstract",
    )
    return parser.parse_args()


def load_yaml(path: str | Path) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def ensure_directories(settings: dict[str, Any]) -> None:
    for key in ["output_dir", "paper_dir", "text_dir", "chunk_dir", "vector_db_dir"]:
        Path(settings[key]).mkdir(parents=True, exist_ok=True)


def export_token_usage(output_dir: str, logger) -> None:
    output_path = Path(output_dir)
    usage = usage_summary()
    totals = usage_totals()
    (output_path / "token_usage.json").write_text(
        json.dumps({"by_model_stage": usage, "totals": totals}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    pd.DataFrame(
        [{"metric": key, "tokens": value} for key, value in usage.items()]
        + [{"metric": f"TOTAL:{key}", "tokens": value} for key, value in totals.items()]
    ).to_csv(output_path / "token_usage.csv", index=False, encoding="utf-8-sig")
    logger.info(
        "Token usage input=%s output=%s total=%s",
        totals["input_tokens"],
        totals["output_tokens"],
        totals["total_tokens"],
    )


def main() -> None:
    load_dotenv()
    args = parse_args()
    settings = load_yaml(args.settings)
    schema = load_yaml(args.schema)
    ensure_directories(settings)

    logger = setup_logger(settings["output_dir"])
    exclude_terms = [term.strip() for term in args.exclude_terms.split(",") if term.strip()]
    require_terms = [term.strip() for term in args.require_terms.split(",") if term.strip()]
    if args.crawl_all_oa:
        if args.crawl_limit is not None and args.crawl_limit <= 0:
            raise ValueError("--crawl_limit must be greater than zero")
        if args.from_year and args.to_year and args.from_year > args.to_year:
            raise ValueError("--from_year must be less than or equal to --to_year")
        providers = [provider.strip() for provider in args.search_providers.split(",") if provider.strip()]
        logger.info("Starting OA journal crawl topic=%s providers=%s", args.topic, ",".join(providers))
        summary = crawl_open_access_journals(
            topic=args.topic,
            output_dir=settings["output_dir"],
            paper_dir=settings["paper_dir"],
            providers=providers,
            timeout=int(settings.get("request_timeout", 30)),
            user_agent=settings.get("user_agent"),
            exclude_terms=exclude_terms,
            require_terms=require_terms,
            max_results_per_provider=args.crawl_limit,
            from_year=args.from_year,
            to_year=args.to_year,
            request_delay=float(settings.get("search_request_delay", 0.1)),
            fresh=args.fresh_crawl,
            logger=logger,
        )
        logger.info(
            "OA crawl completed metadata=%s downloaded=%s skipped=%s output=%s",
            summary["counts"]["metadata"],
            summary["counts"]["downloaded"],
            summary["counts"]["skipped"],
            summary["crawl_dir"],
        )
        return

    max_papers = args.max_papers or int(settings.get("max_papers", 30))
    logger.info("Starting pipeline topic=%s max_papers=%s", args.topic, max_papers)

    skipped: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []

    metadata_path = Path(settings["output_dir"]) / "metadata.csv"
    metadata = search_openalex(
        topic=args.topic,
        max_papers=max_papers,
        output_path=str(metadata_path),
        timeout=int(settings.get("request_timeout", 30)),
        user_agent=settings.get("user_agent"),
        exclude_terms=exclude_terms,
        require_terms=require_terms,
    )
    if metadata.empty:
        logger.warning("No search results found")
        export_results(results, metadata, [{"stage": "search", "reason": "No search results"}], settings["output_dir"], schema)
        export_token_usage(settings["output_dir"], logger)
        return

    oa_metadata, oa_skipped = attach_open_access_urls(metadata, timeout=int(settings.get("request_timeout", 30)))
    skipped.extend(oa_skipped)
    export_metadata = pd.concat([oa_metadata, pd.DataFrame(oa_skipped)], ignore_index=True, sort=False)
    if export_metadata.empty:
        export_metadata = metadata
    logger.info("Open-access PDFs resolved: %s/%s", len(oa_metadata), len(metadata))

    if oa_metadata.empty:
        export_results(results, export_metadata, skipped, settings["output_dir"], schema)
        export_token_usage(settings["output_dir"], logger)
        return

    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.")

    vector_store = VectorStore(settings["vector_db_dir"], settings["embedding_model"])
    extractor = LLMExtractor(settings["openai_model"], temperature=float(settings.get("temperature", 0)))

    for row in tqdm(oa_metadata.to_dict("records"), desc="Processing papers"):
        paper_id = str(row.get("paper_id"))
        try:
            pdf_path, skip = download_pdf(
                row,
                paper_dir=settings["paper_dir"],
                timeout=int(settings.get("request_timeout", 30)),
                user_agent=settings.get("user_agent"),
            )
            if skip:
                skipped.append(skip)
                continue

            text_path, skip = parse_pdf_to_text(pdf_path, row, settings["text_dir"])
            if skip:
                skipped.append(skip)
                continue

            raw_text = Path(text_path).read_text(encoding="utf-8")
            cleaned_text = clean_text(raw_text, include_references=bool(settings.get("include_references", True)))
            chunks = chunk_text(
                cleaned_text,
                row,
                chunk_size=int(settings.get("chunk_size", 2000)),
                chunk_overlap=int(settings.get("chunk_overlap", 200)),
            )
            save_chunks(chunks, settings["chunk_dir"], paper_id)
            vector_store.add_chunks(paper_id, chunks)

            contexts = retrieve_field_contexts(vector_store, paper_id, schema, int(settings.get("top_k", 5)))
            extracted = extractor.extract(row, schema, contexts)
            extracted.setdefault("paper_id", row.get("paper_id"))
            extracted.setdefault("title", row.get("title"))
            extracted.setdefault("doi", row.get("doi"))
            extracted.setdefault("year", row.get("year"))
            retrieved_chunks = {
                hit["chunk_id"]: hit
                for hits in contexts.values()
                for hit in hits
                if hit.get("chunk_id")
            }
            validated, warnings = validate_extraction(extracted, schema, retrieved_chunks.values())
            if warnings:
                logger.warning("Validation warnings for %s: %s", paper_id, "; ".join(warnings))
            results.append(validated)
        except Exception as exc:
            logger.exception("Failed paper_id=%s", paper_id)
            skipped.append(
                {
                    "paper_id": row.get("paper_id"),
                    "title": row.get("title"),
                    "doi": row.get("doi"),
                    "stage": "pipeline",
                    "reason": str(exc),
                }
            )

        export_results(results, export_metadata, skipped, settings["output_dir"], schema)

    logger.info("Pipeline completed extracted=%s skipped=%s", len(results), len(skipped))
    export_token_usage(settings["output_dir"], logger)


if __name__ == "__main__":
    main()
