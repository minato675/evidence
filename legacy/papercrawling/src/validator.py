from __future__ import annotations

import re
from typing import Any, Iterable


def validate_extraction(
    result: dict[str, Any],
    schema: dict[str, Any],
    source_chunks: Iterable[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """Validate and normalize an extraction result against the configured schema."""
    warnings: list[str] = []
    chunk_index = _index_chunks(source_chunks)
    if schema.get("output_mode") == "data_points":
        return _validate_data_points(result, schema, chunk_index)

    result.setdefault("extracted_fields", {})

    schema_fields = {field["name"]: field for field in schema.get("fields", [])}
    for name, field in schema_fields.items():
        entry = result["extracted_fields"].get(name)
        if not isinstance(entry, dict):
            entry = {"value": None, "unit": field.get("unit"), "evidence_text": None, "source_chunk_id": None}
            result["extracted_fields"][name] = entry
            warnings.append(f"Missing field added: {name}")

        entry.setdefault("unit", field.get("unit"))
        entry.setdefault("evidence_text", None)
        entry.setdefault("source_chunk_id", None)

        if field.get("type") == "number":
            entry["value"] = _coerce_number_value(entry.get("value"), field.get("allow_multiple", False), warnings, name)
        elif field.get("allow_multiple") and entry.get("value") not in (None, "Not specified") and not isinstance(entry.get("value"), list):
            entry["value"] = [entry.get("value")]

        if entry.get("unit") and field.get("unit") and entry["unit"] != field["unit"]:
            warnings.append(f"Unit differs for {name}: extracted={entry['unit']} schema={field['unit']}")
        if entry.get("value") not in (None, "Not specified", [], "") and not entry.get("evidence_text"):
            warnings.append(f"Missing evidence_text for {name}")
        entry["validation_status"] = _validate_evidence(
            entry.get("evidence_text"),
            entry.get("source_chunk_id"),
            chunk_index,
            warnings,
            f"field {name}",
        )

    extra_fields = set(result["extracted_fields"]) - set(schema_fields)
    for name in extra_fields:
        warnings.append(f"Unexpected field removed: {name}")
        result["extracted_fields"].pop(name, None)

    return result, warnings


def _validate_data_points(
    result: dict[str, Any],
    schema: dict[str, Any],
    chunk_index: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    schema_fields = {field["name"]: field for field in schema.get("fields", [])}
    records = result.get("records")
    if not isinstance(records, list):
        records = []
        result["records"] = records
        warnings.append("Missing records array added")

    normalized_records: list[dict[str, Any]] = []
    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            warnings.append(f"Record {index} is not an object and was skipped")
            continue
        fields = record.get("fields")
        if not isinstance(fields, dict):
            fields = {}
            warnings.append(f"Record {index} missing fields object")

        normalized_fields: dict[str, Any] = {}
        for name, field in schema_fields.items():
            value = fields.get(name)
            if field.get("type") == "number":
                value = _coerce_number_scalar(value, warnings, f"record {index} {name}")
            elif isinstance(value, list):
                value = "; ".join(str(item) for item in value if item not in (None, ""))
            normalized_fields[name] = value

        identity_fields = list(schema.get("record_identity") or schema_fields)
        if not any(normalized_fields.get(name) not in (None, "", "Not specified") for name in identity_fields):
            warnings.append(f"Record {index} has no useful material/property data and was dropped")
            continue

        confidence = str(record.get("confidence") or "low").lower()
        if confidence not in {"low", "medium", "high"}:
            warnings.append(f"Record {index} has invalid confidence: {confidence!r}")
            confidence = "low"
        source_chunk_id = str(record.get("source_chunk_id") or "") or None
        validation_status = _validate_evidence(
            record.get("evidence_text"),
            source_chunk_id,
            chunk_index,
            warnings,
            f"record {index}",
        )
        source_page_range = record.get("source_page_range")
        if source_chunk_id and source_chunk_id in chunk_index:
            source_page_range = chunk_index[source_chunk_id].get("page_range") or source_page_range

        normalized_records.append(
            {
                "fields": normalized_fields,
                "evidence_text": record.get("evidence_text"),
                "source_chunk_id": source_chunk_id,
                "source_page_range": source_page_range,
                "confidence": confidence,
                "validation_status": validation_status,
            }
        )

    result["records"] = normalized_records
    return result, warnings


def _index_chunks(source_chunks: Iterable[dict[str, Any]] | None) -> dict[str, dict[str, Any]]:
    if source_chunks is None:
        return {}
    return {
        str(chunk["chunk_id"]): chunk
        for chunk in source_chunks
        if isinstance(chunk, dict) and chunk.get("chunk_id")
    }


def _validate_evidence(
    evidence_text: Any,
    source_chunk_id: Any,
    chunk_index: dict[str, dict[str, Any]],
    warnings: list[str],
    label: str,
) -> str:
    """Verify that cited evidence is contained in the cited retrieved chunk."""
    if not chunk_index:
        return "not_checked"
    if not source_chunk_id:
        warnings.append(f"Missing source_chunk_id for {label}")
        return "unverified"
    chunk = chunk_index.get(str(source_chunk_id))
    if chunk is None:
        warnings.append(f"Unknown source_chunk_id for {label}: {source_chunk_id}")
        return "unverified"
    if not evidence_text:
        warnings.append(f"Missing evidence_text for {label}")
        return "unverified"

    evidence = _normalize_text(str(evidence_text))
    source = _normalize_text(str(chunk.get("text") or ""))
    if evidence and evidence in source:
        return "verified"
    warnings.append(f"Evidence text not found in source chunk for {label}: {source_chunk_id}")
    return "unverified"


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def _coerce_number_value(value: Any, allow_multiple: bool, warnings: list[str], name: str) -> Any:
    if value in (None, "Not specified", ""):
        return value
    values = value if isinstance(value, list) else [value]
    coerced: list[float] = []
    for item in values:
        try:
            coerced.append(float(item))
        except (TypeError, ValueError):
            warnings.append(f"Could not coerce numeric field {name}: {item!r}")
    if allow_multiple:
        return coerced if coerced else None
    return coerced[0] if coerced else None


def _coerce_number_scalar(value: Any, warnings: list[str], name: str) -> float | None:
    if value in (None, "Not specified", ""):
        return None
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, str):
        value = value.replace(",", "").strip()
        if not value:
            return None
    try:
        return float(value)
    except (TypeError, ValueError):
        warnings.append(f"Could not coerce numeric field {name}: {value!r}")
        return None
