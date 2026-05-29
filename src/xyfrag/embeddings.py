"""Embedding backends used by the hybrid retriever."""

from __future__ import annotations

import hashlib
import logging
from typing import Protocol

import numpy as np

from xyfrag.config import RetrievalConfig
from xyfrag.text import chunk_tokens, l2_normalize, tokenize

logger = logging.getLogger(__name__)


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


class BGEEmbeddingBackend:
    """BGE embedding backend powered by FlagEmbedding.

    Args:
        model_name: Hugging Face or local BGE model name.
    """

    def __init__(self, model_name: str) -> None:
        """Load the BGE embedding model.

        Args:
            model_name: BGE model name or local model path.

        Returns:
            None.
        """

        if "bge-m3" in model_name.lower():
            from FlagEmbedding import BGEM3FlagModel

            self._model = BGEM3FlagModel(model_name, use_fp16=False)
            self._is_m3 = True
        else:
            from FlagEmbedding import FlagModel

            self._model = FlagModel(
                model_name,
                query_instruction_for_retrieval="为这个句子生成表示以用于检索相关文章：",
                use_fp16=False,
            )
            self._is_m3 = False

    def encode(self, texts: list[str]) -> np.ndarray:
        """Encode text with BGE dense vectors.

        Args:
            texts: Texts to encode.

        Returns:
            Normalized dense embedding matrix.
        """

        if self._is_m3:
            output = self._model.encode(texts, return_dense=True)
            dense_vectors = output["dense_vecs"]
        else:
            dense_vectors = self._model.encode(texts)
        vectors = np.asarray(dense_vectors, dtype=np.float32)
        return np.asarray([l2_normalize(vector) for vector in vectors], dtype=np.float32)


def create_embedding_backend(config: RetrievalConfig) -> EmbeddingBackend:
    """Create an embedding backend from retrieval settings.

    Args:
        config: Retrieval settings.

    Returns:
        Embedding backend instance.
    """

    if not config.use_local_models:
        return HashingEmbeddingBackend()

    try:
        if config.embedding_backend == "bge":
            return BGEEmbeddingBackend(config.embedding_model)
        return SentenceTransformerEmbeddingBackend(config.embedding_model)
    except Exception as exc:
        if not config.allow_model_fallback:
            raise
        logger.warning(
            "Embedding model unavailable backend=%s model=%s; falling back to hashing: %s",
            config.embedding_backend,
            config.embedding_model,
            exc,
        )
    return HashingEmbeddingBackend()
