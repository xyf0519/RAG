"""Shared data schemas for retrieval and chat orchestration."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal


@dataclass(frozen=True)
class DocumentChunk:
    """A chunk of source text stored in the retrieval index.

    Args:
        doc_id: Stable source document identifier.
        chunk_id: Stable chunk identifier.
        title: Human-readable document title.
        text: Chunk text.
        metadata: Additional structured metadata.
    """

    doc_id: str
    chunk_id: str
    title: str
    text: str
    metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """Serialize the chunk to a dictionary.

        Args:
            None.

        Returns:
            Dictionary representation of the chunk.
        """

        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DocumentChunk":
        """Deserialize a document chunk from a dictionary.

        Args:
            data: Dictionary representation of a chunk.

        Returns:
            Reconstructed document chunk.

        Raises:
            KeyError: If required keys are missing.
        """

        return cls(
            doc_id=str(data["doc_id"]),
            chunk_id=str(data["chunk_id"]),
            title=str(data["title"]),
            text=str(data["text"]),
            metadata=dict(data.get("metadata", {})),
        )


@dataclass(frozen=True)
class RetrievedDocument:
    """A retrieved and scored document chunk.

    Args:
        chunk: Retrieved document chunk.
        score: Final score after retrieval or reranking.
        rank: One-based rank in the current result set.
        source_index: One-based citation index used in prompts.
    """

    chunk: DocumentChunk
    score: float
    rank: int
    source_index: int


@dataclass(frozen=True)
class ChatMessage:
    """A chat message stored in the conversation session.

    Args:
        role: Message role.
        content: Message content.
    """

    role: Literal["user", "assistant"]
    content: str
