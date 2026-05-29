"""Hybrid BM25 and embedding retriever."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from xyfrag.bm25 import BM25Index
from xyfrag.config import RetrievalConfig
from xyfrag.embeddings import EmbeddingBackend
from xyfrag.index import KnowledgeIndex
from xyfrag.schemas import DocumentChunk
from xyfrag.text import cosine_similarity, min_max_normalize, tokenize

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RetrievalCandidate:
    """Candidate returned by the hybrid retriever.

    Args:
        chunk: Retrieved document chunk.
        score: Fused retrieval score.
        bm25_score: Normalized BM25 score.
        embedding_score: Normalized embedding score.
    """

    chunk: DocumentChunk
    score: float
    bm25_score: float
    embedding_score: float


class HybridRetriever:
    """Retrieve documents with lexical and semantic recall fusion."""

    def __init__(
        self,
        knowledge_index: KnowledgeIndex,
        embedding_backend: EmbeddingBackend,
        config: RetrievalConfig,
    ) -> None:
        """Initialize the hybrid retriever.

        Args:
            knowledge_index: Loaded knowledge index.
            embedding_backend: Embedding backend used for query encoding.
            config: Retrieval settings.

        Returns:
            None.
        """

        self._index = knowledge_index
        self._embedding_backend = embedding_backend
        self._config = config
        self._bm25 = BM25Index([tokenize(chunk.text) for chunk in knowledge_index.chunks])

    def retrieve(self, query: str) -> list[RetrievalCandidate]:
        """Retrieve candidate chunks using fused BM25 and embedding scores.

        Args:
            query: Rewritten standalone query.

        Returns:
            Candidate chunks ordered by fused retrieval score.
        """

        if not self._index.chunks:
            return []

        bm25_scores = self._bm25.scores(tokenize(query))
        query_embedding = self._embedding_backend.encode([query])[0]
        embedding_scores = cosine_similarity(query_embedding, self._index.embeddings)

        bm25_ranked = self._top_indices(bm25_scores, self._config.bm25_top_k)
        embedding_ranked = self._top_indices(
            embedding_scores.tolist(),
            self._config.embedding_top_k,
        )
        candidate_indices = sorted(set(bm25_ranked) | set(embedding_ranked))

        bm25_norm_by_index = self._normalize_subset(bm25_scores, candidate_indices)
        embedding_norm_by_index = self._normalize_subset(
            embedding_scores.tolist(),
            candidate_indices,
        )

        candidates = [
            RetrievalCandidate(
                chunk=self._index.chunks[index],
                score=0.5 * bm25_norm_by_index[index]
                + 0.5 * embedding_norm_by_index[index],
                bm25_score=bm25_norm_by_index[index],
                embedding_score=embedding_norm_by_index[index],
            )
            for index in candidate_indices
        ]
        candidates.sort(key=lambda item: item.score, reverse=True)
        logger.info(
            "Hybrid retrieval docs=%s",
            [candidate.chunk.chunk_id for candidate in candidates],
        )
        return candidates

    @staticmethod
    def _top_indices(scores: list[float], top_k: int) -> list[int]:
        """Return indices for top-scoring entries.

        Args:
            scores: Score list.
            top_k: Maximum number of indices.

        Returns:
            Top indices ordered by score descending.
        """

        indexed_scores = list(enumerate(scores))
        indexed_scores.sort(key=lambda item: item[1], reverse=True)
        return [index for index, _ in indexed_scores[:top_k]]

    @staticmethod
    def _normalize_subset(
        scores: list[float],
        candidate_indices: list[int],
    ) -> dict[int, float]:
        """Normalize scores for a subset of candidates.

        Args:
            scores: Score list for the whole corpus.
            candidate_indices: Candidate row indices.

        Returns:
            Mapping from corpus index to normalized score.
        """

        subset_scores = [scores[index] for index in candidate_indices]
        normalized = min_max_normalize(subset_scores)
        return {
            candidate_index: normalized_score
            for candidate_index, normalized_score in zip(candidate_indices, normalized)
        }
