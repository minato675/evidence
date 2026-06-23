from __future__ import annotations

import json
from typing import Any

from openai import OpenAI
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .usage_tracker import add_usage


class ExtractionError(RuntimeError):
    """Raised when LLM extraction cannot produce valid JSON."""


class LLMExtractor:
    def __init__(self, model: str, temperature: float = 0) -> None:
        self.model = model
        self.temperature = temperature
        self.client = OpenAI()

    def extract(
        self,
        paper: dict[str, Any],
        schema: dict[str, Any],
        field_contexts: dict[str, list[dict[str, Any]]],
    ) -> dict[str, Any]:
        prompt = self._build_prompt(paper, schema, field_contexts)
        raw = self._call_model(prompt)
        try:
            parsed = json.loads(_strip_code_fence(raw))
        except json.JSONDecodeError as exc:
            raise ExtractionError(f"JSON parsing failed: {exc}; raw={raw[:500]}") from exc
        return parsed

    @retry(
        retry=retry_if_exception_type(Exception),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        reraise=True,
    )
    def _call_model(self, prompt: str) -> str:
        response_kwargs = {
            "model": self.model,
            "input": [
                {
                    "role": "system",
                    "content": (
                        "You extract structured data from scientific papers. "
                        "Return only valid JSON. Do not infer values without evidence."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        }
        if self.temperature is not None and not self.model.startswith("gpt-5"):
            response_kwargs["temperature"] = self.temperature

        try:
            response = self.client.responses.create(**response_kwargs)
            add_usage("llm", self.model, getattr(response, "usage", None))
            output_text = getattr(response, "output_text", None)
            if output_text:
                return output_text
        except TypeError:
            pass

        chat_kwargs = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You extract structured data from scientific papers. "
                        "Return only valid JSON. Do not infer values without evidence."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        }
        if self.temperature is not None and not self.model.startswith("gpt-5"):
            chat_kwargs["temperature"] = self.temperature
        response = self.client.chat.completions.create(
            **chat_kwargs,
        )
        add_usage("llm", self.model, getattr(response, "usage", None))
        return response.choices[0].message.content or "{}"

    def _build_prompt(
        self,
        paper: dict[str, Any],
        schema: dict[str, Any],
        field_contexts: dict[str, list[dict[str, Any]]],
    ) -> str:
        fields = schema.get("fields", [])
        compact_schema = [
            {
                "name": field.get("name"),
                "description": field.get("description"),
                "type": field.get("type"),
                "unit": field.get("unit"),
                "required": field.get("required", False),
                "allow_multiple": field.get("allow_multiple", False),
            }
            for field in fields
        ]

        unique_chunks: dict[str, dict[str, Any]] = {}
        for hits in field_contexts.values():
            for hit in hits:
                unique_chunks[hit["chunk_id"]] = {
                    "chunk_id": hit["chunk_id"],
                    "page_range": hit.get("page_range", ""),
                    "text": hit.get("text", "")[:3000],
                }

        payload = {
            "paper": {
                "paper_id": paper.get("paper_id"),
                "title": paper.get("title"),
                "doi": paper.get("doi"),
                "year": paper.get("year"),
                "journal": paper.get("journal", ""),
                "abstract": paper.get("abstract", ""),
            },
            "schema": compact_schema,
            "chunks": list(unique_chunks.values()),
        }

        if schema.get("output_mode") == "data_points":
            payload["task"] = (
                "Build a row-wise materials database from the paper chunks. "
                "Return one record per distinct material/sample/processing/test condition data point. "
                "Do not make one record per paper. Do not put unrelated values in the same record. "
                "If a table reports several compositions or sample names, create separate records for each row/sample. "
                "Only extract values explicitly supported by evidence. Use null when unknown. "
                "Each record must include fields, evidence_text, source_chunk_id, source_page_range, and confidence. "
                "The evidence_text should be short but enough to audit the row."
            )
            payload["required_output_shape"] = {
                "paper_id": paper.get("paper_id"),
                "title": paper.get("title"),
                "doi": paper.get("doi"),
                "records": [
                    {
                        "fields": {field["name"]: None for field in fields},
                        "evidence_text": None,
                        "source_chunk_id": None,
                        "source_page_range": None,
                        "confidence": "low|medium|high",
                    }
                ],
            }
        else:
            payload["task"] = (
                "Extract values matching the schema from the provided paper chunks. "
                "Every extracted field must include value, unit, evidence_text, and source_chunk_id. "
                "If a value is not explicitly supported by the chunks, use null or 'Not specified'."
            )
            payload["required_output_shape"] = {
                "paper_id": paper.get("paper_id"),
                "title": paper.get("title"),
                "doi": paper.get("doi"),
                "extracted_fields": {
                    field["name"]: {
                        "value": None,
                        "unit": field.get("unit"),
                        "evidence_text": None,
                        "source_chunk_id": None,
                    }
                    for field in fields
                },
            }

        return json.dumps(payload, ensure_ascii=False)


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return text
