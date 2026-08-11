from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import pandas as pd

from src.chunker import chunk_text
from src.exporter import export_results
from src.validator import validate_extraction


class ChunkingTests(unittest.TestCase):
    def test_page_metadata_survives_chunks_without_page_marker(self) -> None:
        text = (
            "[PAGE 1]\n"
            + "Alpha material property sentence. " * 20
            + "\n[PAGE 2]\n"
            + "Beta oxidation result sentence. " * 20
        )

        chunks = chunk_text(text, {"paper_id": "W1"}, chunk_size=120, chunk_overlap=20)

        self.assertGreater(len(chunks), 4)
        self.assertTrue(all(chunk["page_range"] for chunk in chunks))
        self.assertEqual(chunks[-1]["page_start"], 2)
        self.assertEqual(chunks[-1]["page_end"], 2)


class EvidenceValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = {
            "output_mode": "data_points",
            "fields": [
                {
                    "name": "composition",
                    "group": "Material",
                    "type": "string",
                }
            ],
        }
        self.chunk = {
            "chunk_id": "W1_chunk_0001",
            "page_range": "4",
            "text": "The measured composition was Cr2AlC at 1200 degrees C.",
        }

    def test_matching_evidence_is_verified_and_page_is_canonicalized(self) -> None:
        result = {
            "records": [
                {
                    "fields": {"composition": "Cr2AlC"},
                    "evidence_text": "composition was Cr2AlC",
                    "source_chunk_id": "W1_chunk_0001",
                    "source_page_range": "99",
                    "confidence": "HIGH",
                }
            ]
        }

        validated, warnings = validate_extraction(result, self.schema, [self.chunk])
        record = validated["records"][0]

        self.assertEqual(warnings, [])
        self.assertEqual(record["validation_status"], "verified")
        self.assertEqual(record["source_page_range"], "4")
        self.assertEqual(record["confidence"], "high")

    def test_unknown_chunk_is_unverified(self) -> None:
        result = {
            "records": [
                {
                    "fields": {"composition": "Cr2AlC"},
                    "evidence_text": "composition was Cr2AlC",
                    "source_chunk_id": "invented_chunk",
                }
            ]
        }

        validated, warnings = validate_extraction(result, self.schema, [self.chunk])

        self.assertEqual(validated["records"][0]["validation_status"], "unverified")
        self.assertTrue(any("Unknown source_chunk_id" in warning for warning in warnings))

    def test_custom_schema_uses_configured_record_identity(self) -> None:
        schema = {
            "output_mode": "data_points",
            "record_identity": ["sample_id"],
            "fields": [{"name": "sample_id", "type": "string"}],
        }
        result = {
            "records": [
                {
                    "fields": {"sample_id": "S-01"},
                    "evidence_text": "composition was Cr2AlC",
                    "source_chunk_id": "W1_chunk_0001",
                }
            ]
        }

        validated, _ = validate_extraction(result, schema, [self.chunk])

        self.assertEqual(len(validated["records"]), 1)


class ExportTests(unittest.TestCase):
    def test_data_point_export_uses_schema_and_keeps_provenance(self) -> None:
        schema = {
            "output_mode": "data_points",
            "fields": [
                {"name": "composition", "group": "Material", "type": "string"},
                {"name": "custom_metric", "group": "Custom", "type": "number"},
            ],
        }
        results = [
            {
                "title": "Example paper",
                "year": 2026,
                "doi": "10.0000/example",
                "records": [
                    {
                        "fields": {"composition": "Cr2AlC", "custom_metric": 42.0},
                        "evidence_text": "Cr2AlC reached 42.0 units.",
                        "source_chunk_id": "W1_chunk_0001",
                        "source_page_range": "4",
                        "confidence": "high",
                        "validation_status": "verified",
                    }
                ],
            }
        ]

        with tempfile.TemporaryDirectory() as directory:
            export_results(results, pd.DataFrame(), [], directory, schema)
            frame = pd.read_csv(Path(directory) / "extracted_database.csv")

        self.assertIn("Custom metric", frame.columns)
        self.assertIn("Evidence text", frame.columns)
        self.assertIn("Source pages", frame.columns)
        self.assertIn("Validation status", frame.columns)
        self.assertEqual(frame.loc[0, "Validation status"], "verified")


if __name__ == "__main__":
    unittest.main()
