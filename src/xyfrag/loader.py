"""Knowledge-base document loading and chunking."""

from __future__ import annotations

import logging
from pathlib import Path

from xyfrag.config import PROJECT_ROOT, RetrievalConfig
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
        sections = self._extract_markdown_sections(text)
        if not sections:
            plain_text = self._markdown_to_plain_text(text)
            sections = [(title, plain_text)]

        doc_id = file_path.stem
        source_path = self._source_path(file_path)
        chunks: list[DocumentChunk] = []
        chunk_number = 1

        for section_title, section_text in sections:
            normalized = normalize_text(section_text)
            if not normalized:
                continue

            chunk_size = self._config.chunk_size
            overlap = min(self._config.chunk_overlap, max(chunk_size - 1, 0))
            step = max(chunk_size - overlap, 1)

            for start in range(0, len(normalized), step):
                end = min(start + chunk_size, len(normalized))
                chunk_text = normalized[start:end].strip()
                if not chunk_text:
                    continue

                chunks.append(
                    DocumentChunk(
                        doc_id=doc_id,
                        chunk_id=f"{doc_id}-{chunk_number:04d}",
                        title=section_title or title,
                        text=chunk_text,
                        metadata={
                            "source_path": source_path,
                            "section_title": section_title or title,
                            "start_char": start,
                            "end_char": end,
                        },
                    )
                )
                chunk_number += 1

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
    def _source_path(file_path: Path) -> str:
        """Return a portable source path for citation metadata."""

        try:
            return str(file_path.resolve().relative_to(PROJECT_ROOT))
        except ValueError:
            return str(file_path)

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

    @staticmethod
    def _extract_markdown_sections(text: str) -> list[tuple[str, str]]:
        """Split Markdown into heading-based knowledge sections."""

        document_title = ""
        sections: list[tuple[str, str]] = []
        current_title = ""
        current_lines: list[str] = []

        def flush_current() -> None:
            if current_title and current_lines:
                heading = current_title.strip()
                body = "\n".join([f"{heading}。", *current_lines])
                sections.append((heading, body))

        for line in text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("# "):
                document_title = stripped.lstrip("#").strip()
                continue
            if stripped.startswith("## "):
                flush_current()
                current_title = stripped.lstrip("#").strip()
                current_lines = []
                continue
            if current_title:
                current_lines.append(stripped)

        flush_current()
        if sections:
            return [(title or document_title, body) for title, body in sections]
        return []
