"""Text normalization and vector math helpers."""

from __future__ import annotations

import math
import re
from collections.abc import Iterable

import numpy as np

_TOKEN_PATTERN = re.compile(r"[\u4e00-\u9fff]|[a-zA-Z0-9_]+")


def normalize_text(text: str) -> str:
    """Normalize user or document text for retrieval.

    Args:
        text: Raw text.

    Returns:
        Normalized text with collapsed whitespace.
    """

    return re.sub(r"\s+", " ", text).strip()


def tokenize(text: str) -> list[str]:
    """Tokenize mixed Chinese and English text.

    Args:
        text: Input text.

    Returns:
        Lowercased tokens. Chinese characters are kept as individual tokens,
        while ASCII words and numbers are kept as word tokens.
    """

    return [match.group(0).lower() for match in _TOKEN_PATTERN.finditer(text)]


def chunk_tokens(tokens: list[str], ngram_size: int) -> Iterable[str]:
    """Yield fixed-size token ngrams.

    Args:
        tokens: Token list.
        ngram_size: Number of tokens per ngram.

    Returns:
        Iterable of ngram strings.
    """

    if ngram_size <= 1:
        yield from tokens
        return

    for index in range(0, max(len(tokens) - ngram_size + 1, 0)):
        yield "".join(tokens[index : index + ngram_size])


def l2_normalize(vector: np.ndarray) -> np.ndarray:
    """L2-normalize a numeric vector.

    Args:
        vector: Input vector.

    Returns:
        Normalized vector, or the original vector if its norm is zero.
    """

    norm = float(np.linalg.norm(vector))
    if math.isclose(norm, 0.0):
        return vector
    return vector / norm


def cosine_similarity(query_vector: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Compute cosine similarity between one vector and a matrix.

    Args:
        query_vector: One-dimensional query vector.
        matrix: Two-dimensional matrix of document vectors.

    Returns:
        Similarity score for each matrix row.

    Raises:
        ValueError: If the embedding matrix is not two-dimensional.
    """

    if matrix.ndim != 2:
        raise ValueError("Embedding matrix must be two-dimensional")
    if matrix.shape[0] == 0:
        return np.array([], dtype=np.float32)

    normalized_query = l2_normalize(query_vector.astype(np.float32))
    normalized_matrix = matrix.astype(np.float32)
    norms = np.linalg.norm(normalized_matrix, axis=1, keepdims=True)
    norms[norms == 0.0] = 1.0
    normalized_matrix = normalized_matrix / norms
    return normalized_matrix @ normalized_query


def min_max_normalize(scores: list[float]) -> list[float]:
    """Normalize scores to the 0-1 range.

    Args:
        scores: Raw score list.

    Returns:
        Normalized score list.
    """

    if not scores:
        return []

    minimum = min(scores)
    maximum = max(scores)
    if math.isclose(maximum, minimum):
        return [1.0 for _ in scores]

    return [(score - minimum) / (maximum - minimum) for score in scores]
