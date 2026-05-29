"""Knowledge-base document loading and chunking."""

from __future__ import annotations

import logging
from pathlib import Path

from xyfrag.config import RetrievalConfig
from xyfrag.schemas import DocumentChunk
from xyfrag.text import normalize_text

logger = logging.getLogger(__name__)


class DocumentLoader:
    """Load campus knowledge-base files and split them into chunks.

    Args:
        raw_docs_dir: Directory containing raw `.md` or `.txt` documents.
        config: Retrieval settings controlling chunk size and overlap.
    """

    def __init__(self, raw_docs_dir: Path, config: RetrievalConfig) -> None:
        """Initialize the loader.

        Args:
            raw_docs_dir: Directory containing source documents.
            config: Retrieval configuration.

        Returns:
            None.
        """

        self._raw_docs_dir = raw_docs_dir
        self._config = config

    def load(self) -> list[DocumentChunk]:
        """Load and chunk all supported knowledge-base files.

        Args:
            None.

        Returns:
            List of document chunks.

        Raises:
            FileNotFoundError: If the raw document directory is missing.
        """

        if not self._raw_docs_dir.exists():
            raise FileNotFoundError(f"Raw docs directory missing: {self._raw_docs_dir}")

        chunks: list[DocumentChunk] = []
        supported_files = sorted(
            path
            for path in self._raw_docs_dir.rglob("*")
            if path.suffix.lower() in {".md", ".txt"} and path.is_file()
        )

        for file_path in supported_files:
            text = file_path.read_text(encoding="utf-8")
            chunks.extend(self._chunk_file(file_path, text))

        logger.info("Loaded %d chunks from %d files", len(chunks), len(supported_files))
        return chunks

    def _chunk_file(self, file_path: Path, text: str) -> list[DocumentChunk]:
        """Split one source file into overlapping chunks.

        Args:
            file_path: Source file path.
            text: Source file text.

        Returns:
            List of chunks for this source file.
        """

        title = self._extract_title(file_path, text)
        plain_text = self._markdown_to_plain_text(text)
        normalized = normalize_text(plain_text)
        if not normalized:
            return []

        chunk_size = self._config.chunk_size
        overlap = min(self._config.chunk_overlap, max(chunk_size - 1, 0))
        step = max(chunk_size - overlap, 1)
        doc_id = file_path.stem
        chunks: list[DocumentChunk] = []

        for chunk_number, start in enumerate(range(0, len(normalized), step), start=1):
            end = min(start + chunk_size, len(normalized))
            chunk_text = normalized[start:end].strip()
            if not chunk_text:
                continue

            chunks.append(
                DocumentChunk(
                    doc_id=doc_id,
                    chunk_id=f"{doc_id}-{chunk_number:04d}",
                    title=title,
                    text=chunk_text,
                    metadata={
                        "source_path": str(file_path),
                        "start_char": start,
                        "end_char": end,
                    },
                )
            )

            if end >= len(normalized):
                break

        return chunks

    @staticmethod
    def _extract_title(file_path: Path, text: str) -> str:
        """Extract a display title from Markdown or filename.

        Args:
            file_path: Source file path.
            text: Raw source text.

        Returns:
            Human-readable title.
        """

        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                return stripped.lstrip("#").strip()
        return file_path.stem.replace("_", " ").replace("-", " ")

    @staticmethod
    def _markdown_to_plain_text(text: str) -> str:
        """Convert simple Markdown headings into sentence-like plain text.

        Args:
            text: Raw Markdown or text document.

        Returns:
            Plain text with headings separated from body sentences.
        """

        lines: list[str] = []
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("#"):
                heading = stripped.lstrip("#").strip()
                lines.append(f"{heading}。")
            else:
                lines.append(stripped)
        return "\n".join(lines)
