from __future__ import annotations

import unittest
from unittest.mock import patch

from src.crossref_search import iter_crossref_pages
from src.oa_checker import attach_open_access_urls
from src.paper_search import iter_openalex_pages


def _openalex_work(identifier: str, doi: str, title: str) -> dict:
    return {
        "id": f"https://openalex.org/{identifier}",
        "doi": f"https://doi.org/{doi}",
        "title": title,
        "abstract_inverted_index": {"Cr2AlC": [0], "oxidation": [1]},
        "authorships": [],
        "publication_year": 2024,
        "publication_date": "2024-01-02",
        "primary_location": {
            "landing_page_url": f"https://doi.org/{doi}",
            "source": {"display_name": "Example Journal", "type": "journal"},
        },
        "best_oa_location": {"pdf_url": f"https://example.org/{identifier}.pdf", "license": "cc-by"},
        "open_access": {"is_oa": True, "oa_status": "gold"},
        "cited_by_count": 3,
    }


class OpenAlexSearchTests(unittest.TestCase):
    @patch("src.paper_search._request_openalex")
    def test_cursor_search_filters_oa_journals_and_deduplicates(self, request) -> None:
        unrelated = _openalex_work("W2", "10.1/b", "Unrelated paper")
        unrelated["abstract_inverted_index"] = {"Other": [0], "topic": [1]}
        request.side_effect = [
            {
                "results": [
                    _openalex_work("W1", "10.1/a", "Cr2AlC oxidation"),
                    unrelated,
                ],
                "meta": {"count": 3, "next_cursor": "cursor-2"},
            },
            {
                "results": [_openalex_work("W3", "10.1/a", "Cr2AlC duplicate")],
                "meta": {"count": 3, "next_cursor": None},
            },
        ]

        pages = list(
            iter_openalex_pages(
                "Cr2AlC oxidation",
                only_open_access=True,
                journal_only=True,
                require_terms=["Cr2AlC"],
                request_delay=0,
            )
        )

        self.assertEqual(sum(len(frame) for frame, _, _ in pages), 1)
        first_params = request.call_args_list[0].args[0]
        self.assertIn("is_oa:true", first_params["filter"])
        self.assertIn("primary_location.source.type:journal", first_params["filter"])
        self.assertEqual(request.call_args_list[1].args[0]["cursor"], "cursor-2")


class CrossrefSearchTests(unittest.TestCase):
    @patch("src.crossref_search._request_crossref")
    def test_crossref_normalizes_publisher_journal_metadata(self, request) -> None:
        request.return_value = {
            "items": [
                {
                    "DOI": "10.1016/example",
                    "title": ["Cr2AlC oxidation coating"],
                    "abstract": "<jats:p>Open access candidate</jats:p>",
                    "author": [{"given": "Ada", "family": "Lovelace"}],
                    "published": {"date-parts": [[2025, 3, 4]]},
                    "container-title": ["Surface and Coatings Technology"],
                    "publisher": "Elsevier BV",
                    "URL": "https://doi.org/10.1016/example",
                    "link": [{"URL": "https://example.org/paper.pdf", "content-type": "application/pdf"}],
                }
            ],
            "total-results": 1,
            "next-cursor": None,
        }

        frame, _, _ = next(iter_crossref_pages("Cr2AlC oxidation", request_delay=0))

        self.assertEqual(frame.loc[0, "publisher"], "Elsevier BV")
        self.assertEqual(frame.loc[0, "journal"], "Surface and Coatings Technology")
        self.assertEqual(frame.loc[0, "metadata_provider"], "crossref")
        self.assertEqual(frame.loc[0, "abstract"], "Open access candidate")
        self.assertEqual(frame.loc[0, "publisher_pdf_url"], "https://example.org/paper.pdf")
        self.assertEqual(frame.loc[0, "openalex_pdf_url"], "")


class OaResolutionTests(unittest.TestCase):
    @patch("src.oa_checker.find_unpaywall_pdf_url")
    def test_openalex_oa_url_avoids_unnecessary_unpaywall_call(self, unpaywall) -> None:
        import pandas as pd

        metadata = pd.DataFrame(
            [
                {
                    "paper_id": "W1",
                    "doi": "10.1/a",
                    "title": "Example",
                    "openalex_pdf_url": "https://example.org/paper.pdf",
                    "openalex_is_oa": True,
                }
            ]
        )

        resolved, skipped = attach_open_access_urls(metadata, prefer_openalex=True)

        self.assertEqual(skipped, [])
        self.assertEqual(resolved.loc[0, "pdf_url_source"], "openalex")
        unpaywall.assert_not_called()


if __name__ == "__main__":
    unittest.main()
