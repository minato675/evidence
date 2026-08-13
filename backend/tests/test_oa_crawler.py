from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from src.oa_crawler import crawl_open_access_journals


class OaCrawlerTests(unittest.TestCase):
    @patch("src.oa_crawler._resolve_and_download")
    @patch("src.oa_crawler._provider_pages")
    def test_multi_provider_crawl_deduplicates_and_resumes(self, provider_pages, resolve) -> None:
        def pages(provider: str, **_: object):
            if provider == "openalex":
                frame = pd.DataFrame(
                    [{"paper_id": "W1", "doi": "10.1/a", "title": "OpenAlex", "metadata_provider": "openalex"}]
                )
            else:
                frame = pd.DataFrame(
                    [
                        {"paper_id": "doi_10.1_a", "doi": "10.1/a", "title": "Duplicate", "metadata_provider": "crossref"},
                        {"paper_id": "doi_10.1_b", "doi": "10.1/b", "title": "Elsevier", "metadata_provider": "crossref"},
                    ]
                )
            yield frame, None, {"count": len(frame), "limit_reached": False}

        provider_pages.side_effect = pages
        resolve.side_effect = lambda frame, *_: (frame.assign(local_pdf_path="paper.pdf", download_status="downloaded"), [])

        with tempfile.TemporaryDirectory() as directory:
            summary = crawl_open_access_journals(
                topic="Cr2AlC oxidation",
                output_dir=directory,
                paper_dir=Path(directory) / "papers",
                request_delay=0,
            )
            metadata = pd.read_csv(Path(summary["crawl_dir"]) / "metadata.csv")
            provider_pages.reset_mock()
            resumed = crawl_open_access_journals(
                topic="Cr2AlC oxidation",
                output_dir=directory,
                paper_dir=Path(directory) / "papers",
                request_delay=0,
            )

        self.assertEqual(len(metadata), 2)
        self.assertEqual(set(metadata["doi"]), {"10.1/a", "10.1/b"})
        self.assertEqual(summary["counts"]["downloaded"], 2)
        self.assertTrue(resumed["complete"])
        provider_pages.assert_not_called()


if __name__ == "__main__":
    unittest.main()
