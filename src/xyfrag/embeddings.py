"""Embedding backends used by the hybrid retriever."""

from __future__ import annotations

import hashlib
from typing import Protocol

import numpy as np

from xyfrag.config import RetrievalConfig
from xyfrag.text import chunk_tokens, l2_normalize, tokenize


class EmbeddingBackend(Protocol):
    """Protocol for document and query embedding backends.

    Args:
        None.
    """

    def encode(self, texts: list[str]) -> np.ndarray:
        """Encode text into dense vectors.

        Args:
            texts: Texts to encode.

        Returns:
            Two-dimensional embedding matrix.
        """


class HashingEmbeddingBackend:
    """Deterministic local embedding backend for offline development.

    Args:
        dimension: Number of hashing dimensions.
    """

    def __init__(self, dimension: int = 384) -> None:
        """Initialize the hashing backend.

        Args:
            dimension: Number of hashing dimensions.

        Returns:
            None.
        """

        self._dimension = dimension

    def encode(self, texts: list[str]) -> np.ndarray:
        """Encode text with a deterministic feature hashing scheme.

        Args:
            texts: Texts to encode.

        Returns:
            Matrix with shape `(len(texts), dimension)`.
        """

        vectors = np.zeros((len(texts), self._dimension), dtype=np.float32)
        for row, text in enumerate(texts):
            tokens = tokenize(text)
            features = list(tokens)
            features.extend(chunk_tokens(tokens, 2))
            features.extend(chunk_tokens(tokens, 3))

            for feature in features:
                digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
                value = int.from_bytes(digest, byteorder="big", signed=False)
                column = value % self._dimension
                sign = 1.0 if (value >> 1) % 2 == 0 else -1.0
                vectors[row, column] += sign

            vectors[row] = l2_normalize(vectors[row])

        return vectors


class SentenceTransformerEmbeddingBackend:
    """SentenceTransformers embedding backend for production-like retrieval.

    Args:
        model_name: Hugging Face or local SentenceTransformers model name.
    """

    def __init__(self, model_name: str) -> None:
        """Load a SentenceTransformers embedding model.

        Args:
            model_name: Model name or local model path.

        Returns:
            None.
        """

        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer(model_name)

    def encode(self, texts: list[str]) -> np.ndarray:
        """Encode text with SentenceTransformers.

        Args:
            texts: Texts to encode.

        Returns:
            Embedding matrix.
        """

        return np.asarray(
            self._model.encode(texts, normalize_embeddings=True),
            dtype=np.float32,
        )


def create_embedding_backend(config: RetrievalConfig) -> EmbeddingBackend:
    """Create an embedding backend from retrieval settings.

    Args:
        config: Retrieval settings.

    Returns:
        Embedding backend instance.
    """

    if config.use_local_models:
        return SentenceTransformerEmbeddingBackend(config.embedding_model)
    return HashingEmbeddingBackend()
