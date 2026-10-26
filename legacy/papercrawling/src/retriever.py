from __future__ import annotations

from typing import Any

from .vector_store import VectorStore


def retrieve_field_contexts(
    vector_store: VectorStore,
    paper_id: str,
    schema: dict[str, Any],
    top_k: int,
) -> dict[str, list[dict[str, Any]]]:
    """Retrieve chunks per schema field using field descriptions as queries."""
    contexts: dict[str, list[dict[str, Any]]] = {}
    for field in schema.get("fields", []):
        name = field["name"]
        query = f"{name}. {field.get('description', '')}. Unit: {field.get('unit') or 'none'}"
        contexts[name] = vector_store.query(paper_id=paper_id, query_text=query, top_k=top_k)
    return contexts

