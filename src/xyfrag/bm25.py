"""Small BM25 implementation for lexical retrieval."""

from __future__ import annotations

import math
from collections import Counter


class BM25Index:
    """BM25 lexical index over tokenized documents.

    Args:
        tokenized_documents: Corpus represented as token lists.
        k1: Term-frequency saturation parameter.
        b: Length-normalization parameter.
    """

    def __init__(
        self,
        tokenized_documents: list[list[str]],
        k1: float = 1.5,
        b: float = 0.75,
    ) -> None:
        """Build a BM25 index.

        Args:
            tokenized_documents: Tokenized corpus.
            k1: BM25 term-frequency saturation parameter.
            b: BM25 document length normalization parameter.

        Returns:
            None.
        """

        self._documents = tokenized_documents
        self._k1 = k1
        self._b = b
        self._doc_count = len(tokenized_documents)
        self._doc_lengths = [len(document) for document in tokenized_documents]
        self._average_doc_length = (
            sum(self._doc_lengths) / self._doc_count if self._doc_count else 0.0
        )
        self._term_frequencies = [Counter(document) for document in tokenized_documents]
        self._idf = self._compute_idf()

    def _compute_idf(self) -> dict[str, float]:
        """Compute inverse document frequency values.

        Args:
            None.

        Returns:
            Mapping from token to IDF score.
        """

        document_frequency: Counter[str] = Counter()
        for document in self._documents:
            document_frequency.update(set(document))

        idf: dict[str, float] = {}
        for token, frequency in document_frequency.items():
            idf[token] = math.log(
                1.0 + (self._doc_count - frequency + 0.5) / (frequency + 0.5)
            )
        return idf

    def scores(self, query_tokens: list[str]) -> list[float]:
        """Score every document for a tokenized query.

        Args:
            query_tokens: Tokenized query.

        Returns:
            BM25 score for every document.
        """

        if not self._documents:
            return []

        scores: list[float] = []
        for index, term_frequency in enumerate(self._term_frequencies):
            score = 0.0
            doc_length = self._doc_lengths[index]
            length_factor = 1.0 - self._b
            if self._average_doc_length > 0:
                length_factor += self._b * doc_length / self._average_doc_length

            for token in query_tokens:
                frequency = term_frequency.get(token, 0)
                if frequency == 0:
                    continue

                numerator = frequency * (self._k1 + 1.0)
                denominator = frequency + self._k1 * length_factor
                score += self._idf.get(token, 0.0) * numerator / denominator

            scores.append(score)

        return scores
