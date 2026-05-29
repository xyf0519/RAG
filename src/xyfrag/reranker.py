"""Reranking backends for retrieval candidates."""

from __future__ import annotations

import logging
from typing import Protocol

from xyfrag.config import RetrievalConfig
from xyfrag.retriever import RetrievalCandidate
from xyfrag.schemas import RetrievedDocument
from xyfrag.text import tokenize

logger = logging.getLogger(__name__)


class Reranker(Protocol):
    """Protocol for retrieval candidate rerankers."""

    def rerank(self, query: str, candidates: list[RetrievalCandidate]) -> list[RetrievedDocument]:
        """Rerank retrieval candidates.

        Args:
            query: Rewritten standalone query.
            candidates: Hybrid retrieval candidates.

        Returns:
            Top reranked documents.
        """


class LexicalOverlapReranker:
    """Lightweight local reranker based on query-token overlap and retrieval score."""

    def __init__(self, top_k: int) -> None:
        """Initialize the local reranker.

        Args:
            top_k: Number of top documents to return.

        Returns:
            None.
        """

        self._top_k = top_k

    def rerank(self, query: str, candidates: list[RetrievalCandidate]) -> list[RetrievedDocument]:
        """Rerank candidates with lexical overlap.

        Args:
            query: Rewritten standalone query.
            candidates: Hybrid retrieval candidates.

        Returns:
            Top reranked documents with citation source indices.
        """

        query_tokens = set(tokenize(query))
        scored: list[tuple[float, RetrievalCandidate]] = []
        for candidate in candidates:
            chunk_tokens = set(tokenize(candidate.chunk.text))
            overlap = len(query_tokens & chunk_tokens)
            denominator = max(len(query_tokens), 1)
            overlap_score = overlap / denominator
            final_score = 0.65 * candidate.score + 0.35 * overlap_score
            scored.append((final_score, candidate))

        scored.sort(key=lambda item: item[0], reverse=True)
        top_results = [
            RetrievedDocument(
                chunk=candidate.chunk,
                score=float(score),
                rank=rank,
                source_index=rank,
            )
            for rank, (score, candidate) in enumerate(scored[: self._top_k], start=1)
        ]
        logger.info(
            "Reranked docs=%s",
            [result.chunk.chunk_id for result in top_results],
        )
        return top_results


class CrossEncoderReranker:
    """SentenceTransformers CrossEncoder reranker."""

    def __init__(self, model_name: str, top_k: int) -> None:
        """Load a cross-encoder reranking model.

        Args:
            model_name: Hugging Face or local CrossEncoder model name.
            top_k: Number of top documents to return.

        Returns:
            None.
        """

        from sentence_transformers import CrossEncoder

        self._model = CrossEncoder(model_name)
        self._top_k = top_k

    def rerank(self, query: str, candidates: list[RetrievalCandidate]) -> list[RetrievedDocument]:
        """Rerank candidates with a cross encoder.

        Args:
            query: Rewritten standalone query.
            candidates: Hybrid retrieval candidates.

        Returns:
            Top reranked documents with citation source indices.
        """

        if not candidates:
            return []

        pairs = [(query, candidate.chunk.text) for candidate in candidates]
        raw_scores = self._model.predict(pairs)
        scored = [
            (float(raw_score), candidate)
            for raw_score, candidate in zip(raw_scores, candidates)
        ]
        scored.sort(key=lambda item: item[0], reverse=True)

        return [
            RetrievedDocument(
                chunk=candidate.chunk,
                score=score,
                rank=rank,
                source_index=rank,
            )
            for rank, (score, candidate) in enumerate(scored[: self._top_k], start=1)
        ]


def create_reranker(config: RetrievalConfig) -> Reranker:
    """Create a reranker from retrieval settings.

    Args:
        config: Retrieval settings.

    Returns:
        Reranker instance.
    """

    if config.use_local_models:
        return CrossEncoderReranker(config.reranker_model, config.rerank_top_k)
    return LexicalOverlapReranker(config.rerank_top_k)
