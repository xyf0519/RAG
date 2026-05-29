"""Build, save, and load the retrieval index."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from xyfrag.config import Settings
from xyfrag.embeddings import create_embedding_backend
from xyfrag.loader import DocumentLoader
from xyfrag.schemas import DocumentChunk

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class KnowledgeIndex:
    """Retrieval index containing chunks and their embeddings.

    Args:
        chunks: Indexed document chunks.
        embeddings: Dense vector matrix aligned with `chunks`.
    """

    chunks: list[DocumentChunk]
    embeddings: np.ndarray

    def save(self, index_dir: Path) -> None:
        """Persist the index to disk.

        Args:
            index_dir: Output index directory.

        Returns:
            None.

        Raises:
            OSError: If writing index files fails.
        """

        index_dir.mkdir(parents=True, exist_ok=True)
        chunks_path = index_dir / "chunks.json"
        embeddings_path = index_dir / "embeddings.npy"

        chunks_path.write_text(
            json.dumps(
                [chunk.to_dict() for chunk in self.chunks],
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        np.save(embeddings_path, self.embeddings)
        logger.info("Saved index with %d chunks to %s", len(self.chunks), index_dir)

    @classmethod
    def load(cls, index_dir: Path) -> "KnowledgeIndex":
        """Load a persisted retrieval index.

        Args:
            index_dir: Directory containing `chunks.json` and `embeddings.npy`.

        Returns:
            Loaded knowledge index.

        Raises:
            FileNotFoundError: If any index file is missing.
            ValueError: If chunk and embedding counts do not match.
        """

        chunks_path = index_dir / "chunks.json"
        embeddings_path = index_dir / "embeddings.npy"
        if not chunks_path.exists() or not embeddings_path.exists():
            raise FileNotFoundError(f"Index files missing in {index_dir}")

        chunk_data = json.loads(chunks_path.read_text(encoding="utf-8"))
        chunks = [DocumentChunk.from_dict(item) for item in chunk_data]
        embeddings = np.load(embeddings_path)

        if len(chunks) != embeddings.shape[0]:
            raise ValueError("Chunk count and embedding count do not match")

        logger.info("Loaded index with %d chunks from %s", len(chunks), index_dir)
        return cls(chunks=chunks, embeddings=embeddings)


def build_index(settings: Settings) -> KnowledgeIndex:
    """Build a retrieval index from raw knowledge-base documents.

    Args:
        settings: Application settings.

    Returns:
        Built knowledge index.

    Raises:
        ValueError: If no chunks can be loaded.
    """

    loader = DocumentLoader(settings.paths.raw_docs_dir, settings.retrieval)
    chunks = loader.load()
    if not chunks:
        raise ValueError("No document chunks found. Add .md or .txt files to raw_docs_dir")

    embedding_backend = create_embedding_backend(settings.retrieval)
    embeddings = embedding_backend.encode([chunk.text for chunk in chunks])
    return KnowledgeIndex(chunks=chunks, embeddings=embeddings)
