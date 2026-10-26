from __future__ import annotations

from pathlib import Path
from typing import Any

import chromadb
from openai import OpenAI
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .usage_tracker import add_usage


class VectorStore:
    """Chroma-backed vector store with explicit OpenAI embeddings."""

    def __init__(self, db_dir: str | Path, embedding_model: str) -> None:
        self.db_dir = Path(db_dir)
        self.db_dir.mkdir(parents=True, exist_ok=True)
        self.embedding_model = embedding_model
        self.openai = OpenAI()
        self.client = chromadb.PersistentClient(path=str(self.db_dir))

    def collection_for_paper(self, paper_id: str):
        name = _collection_name(paper_id)
        return self.client.get_or_create_collection(name=name, metadata={"paper_id": paper_id})

    def add_chunks(self, paper_id: str, chunks: list[dict[str, Any]]) -> None:
        if not chunks:
            return
        collection = self.collection_for_paper(paper_id)
        existing = set(collection.get(ids=[chunk["chunk_id"] for chunk in chunks]).get("ids", []))
        new_chunks = [chunk for chunk in chunks if chunk["chunk_id"] not in existing]
        if not new_chunks:
            return

        texts = [chunk["text"] for chunk in new_chunks]
        embeddings = self.embed_texts(texts)
        metadatas = [
            {
                "paper_id": chunk["paper_id"],
                "title": chunk["title"],
                "doi": chunk["doi"],
                "chunk_id": chunk["chunk_id"],
                "page_range": chunk["page_range"],
            }
            for chunk in new_chunks
        ]
        collection.add(
            ids=[chunk["chunk_id"] for chunk in new_chunks],
            documents=texts,
            metadatas=metadatas,
            embeddings=embeddings,
        )

    def query(self, paper_id: str, query_text: str, top_k: int) -> list[dict[str, Any]]:
        collection = self.collection_for_paper(paper_id)
        query_embedding = self.embed_texts([query_text])[0]
        result = collection.query(query_embeddings=[query_embedding], n_results=top_k)
        hits: list[dict[str, Any]] = []
        for document, metadata, distance in zip(
            result.get("documents", [[]])[0],
            result.get("metadatas", [[]])[0],
            result.get("distances", [[]])[0],
        ):
            hit = dict(metadata)
            hit["text"] = document
            hit["distance"] = distance
            hits.append(hit)
        return hits

    @retry(
        retry=retry_if_exception_type(Exception),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=2, max=20),
        reraise=True,
    )
    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        response = self.openai.embeddings.create(model=self.embedding_model, input=texts)
        add_usage("embedding", self.embedding_model, getattr(response, "usage", None))
        return [item.embedding for item in response.data]


def _collection_name(paper_id: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in "_-" else "_" for char in paper_id)
    return f"paper_{cleaned[:50]}"
