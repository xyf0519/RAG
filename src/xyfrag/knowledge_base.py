"""Local knowledge-base operations store."""

from __future__ import annotations

import re
import shutil
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from typing import Literal
from uuid import uuid4

from xyfrag.config import Settings
from xyfrag.index import KnowledgeIndex, build_index

KnowledgeBaseStatus = Literal["active", "disabled"]
IndexStatus = Literal["not_indexed", "pending", "building", "ready", "failed"]
JobStatus = Literal["running", "succeeded", "failed"]

DEFAULT_KNOWLEDGE_BASE_ID = "kb-default"


@dataclass(frozen=True)
class KnowledgeBaseRecord:
    """Knowledge-base metadata exposed to administrators."""

    id: str
    name: str
    description: str
    status: KnowledgeBaseStatus
    document_count: int
    index_status: IndexStatus
    last_indexed_at: float | None
    updated_at: float
    created_at: float


@dataclass(frozen=True)
class KnowledgeDocumentRecord:
    """Uploaded source document metadata."""

    id: str
    knowledge_base_id: str
    filename: str
    title: str
    size: int
    status: str
    created_at: float


@dataclass(frozen=True)
class IndexJobRecord:
    """Synchronous index-build task metadata."""

    id: str
    knowledge_base_id: str
    status: JobStatus
    message: str
    created_at: float
    finished_at: float | None


class KnowledgeBaseStore:
    """SQLite metadata store plus filesystem layout for local operations."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._db_path = settings.paths.ops_db
        self._kb_root = settings.paths.knowledge_bases_dir
        self._model_root = settings.paths.knowledge_models_dir
        self._lock = RLock()
        self._connect().close()
        self._init_schema()
        self.ensure_default_knowledge_base()

    def _connect(self) -> sqlite3.Connection:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_schema(self) -> None:
        with self._lock, self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS knowledge_bases (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL,
                    document_count INTEGER NOT NULL DEFAULT 0,
                    index_status TEXT NOT NULL,
                    last_indexed_at REAL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    knowledge_base_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    title TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
                );

                CREATE TABLE IF NOT EXISTS index_jobs (
                    id TEXT PRIMARY KEY,
                    knowledge_base_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    finished_at REAL,
                    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
                );

                CREATE TABLE IF NOT EXISTS boundary_items (
                    id TEXT PRIMARY KEY,
                    knowledge_base_id TEXT NOT NULL,
                    text TEXT NOT NULL,
                    label INTEGER NOT NULL,
                    source TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
                );

                CREATE TABLE IF NOT EXISTS classifier_jobs (
                    id TEXT PRIMARY KEY,
                    knowledge_base_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    finished_at REAL,
                    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
                );
                """
            )

    def ensure_default_knowledge_base(self) -> KnowledgeBaseRecord:
        existing = self.get_knowledge_base(DEFAULT_KNOWLEDGE_BASE_ID)
        if existing:
            self._create_layout(DEFAULT_KNOWLEDGE_BASE_ID)
            self._copy_legacy_sources(DEFAULT_KNOWLEDGE_BASE_ID)
            now = time.time()
            index_ready = self._index_files_exist(DEFAULT_KNOWLEDGE_BASE_ID)
            with self._lock, self._connect() as connection:
                document_count = self._sync_documents(connection, DEFAULT_KNOWLEDGE_BASE_ID)
                connection.execute(
                    """
                    UPDATE knowledge_bases
                    SET document_count = ?,
                        index_status = ?,
                        last_indexed_at = COALESCE(last_indexed_at, ?),
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        document_count,
                        "ready" if index_ready else existing.index_status,
                        now if index_ready else existing.last_indexed_at,
                        now,
                        DEFAULT_KNOWLEDGE_BASE_ID,
                    ),
                )
            return self.get_knowledge_base(DEFAULT_KNOWLEDGE_BASE_ID)  # type: ignore[return-value]

        now = time.time()
        self._create_layout(DEFAULT_KNOWLEDGE_BASE_ID)
        self._copy_legacy_sources(DEFAULT_KNOWLEDGE_BASE_ID)
        index_status: IndexStatus = (
            "ready" if self._index_files_exist(DEFAULT_KNOWLEDGE_BASE_ID) else "not_indexed"
        )
        with self._lock, self._connect() as connection:
            document_count = self._sync_documents(connection, DEFAULT_KNOWLEDGE_BASE_ID)
            connection.execute(
                """
                INSERT INTO knowledge_bases (
                    id, name, description, status, document_count,
                    index_status, last_indexed_at, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    DEFAULT_KNOWLEDGE_BASE_ID,
                    "默认校园资料库",
                    "由现有 data/raw 资料迁移生成，可直接用于问答。",
                    "active",
                    document_count,
                    index_status,
                    now if index_status == "ready" else None,
                    now,
                    now,
                ),
            )
        return self.get_knowledge_base(DEFAULT_KNOWLEDGE_BASE_ID)  # type: ignore[return-value]

    def list_knowledge_bases(self) -> list[KnowledgeBaseRecord]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM knowledge_bases ORDER BY updated_at DESC"
            ).fetchall()
        return [self._kb_from_row(row) for row in rows]

    def get_knowledge_base(self, knowledge_base_id: str) -> KnowledgeBaseRecord | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM knowledge_bases WHERE id = ?",
                (knowledge_base_id,),
            ).fetchone()
        return self._kb_from_row(row) if row else None

    def default_knowledge_base(self) -> KnowledgeBaseRecord:
        return self.ensure_default_knowledge_base()

    def create_knowledge_base(
        self,
        name: str,
        description: str = "",
        knowledge_base_id: str | None = None,
    ) -> KnowledgeBaseRecord:
        now = time.time()
        kb_id = knowledge_base_id or self._slugify(name, now)
        self._create_layout(kb_id)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO knowledge_bases (
                    id, name, description, status, document_count,
                    index_status, last_indexed_at, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, 0, ?, NULL, ?, ?)
                """,
                (kb_id, name.strip(), description.strip(), "active", "not_indexed", now, now),
            )
        return self.get_knowledge_base(kb_id)  # type: ignore[return-value]

    def update_knowledge_base(
        self,
        knowledge_base_id: str,
        name: str | None = None,
        description: str | None = None,
        status: KnowledgeBaseStatus | None = None,
    ) -> KnowledgeBaseRecord:
        existing = self.require_knowledge_base(knowledge_base_id)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE knowledge_bases
                SET name = ?, description = ?, status = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    name.strip() if name is not None else existing.name,
                    description.strip() if description is not None else existing.description,
                    status or existing.status,
                    time.time(),
                    knowledge_base_id,
                ),
            )
        return self.require_knowledge_base(knowledge_base_id)

    def require_knowledge_base(self, knowledge_base_id: str | None) -> KnowledgeBaseRecord:
        kb_id = knowledge_base_id or DEFAULT_KNOWLEDGE_BASE_ID
        knowledge_base = self.get_knowledge_base(kb_id)
        if not knowledge_base:
            raise KeyError(f"Knowledge base not found: {kb_id}")
        return knowledge_base

    def list_documents(self, knowledge_base_id: str) -> list[KnowledgeDocumentRecord]:
        self.require_knowledge_base(knowledge_base_id)
        with self._lock, self._connect() as connection:
            self._sync_documents(connection, knowledge_base_id)
            rows = connection.execute(
                "SELECT * FROM documents WHERE knowledge_base_id = ? ORDER BY created_at DESC",
                (knowledge_base_id,),
            ).fetchall()
        return [self._document_from_row(row) for row in rows]

    def add_document(
        self,
        knowledge_base_id: str,
        filename: str,
        content: bytes,
    ) -> KnowledgeDocumentRecord:
        self.require_knowledge_base(knowledge_base_id)
        suffix = Path(filename).suffix.lower()
        if suffix not in {".md", ".txt"}:
            raise ValueError("仅支持 Markdown 或 TXT 文档。")
        if not content.strip():
            raise ValueError("文档内容不能为空。")

        now = time.time()
        safe_name = self._safe_filename(filename)
        target_path = self._unique_file_path(self.raw_dir(knowledge_base_id), safe_name)
        target_path.write_bytes(content)
        safe_name = target_path.name
        document_id = f"doc-{knowledge_base_id}-{uuid4().hex[:12]}"
        title = self._extract_title(target_path, content.decode("utf-8", errors="ignore"))

        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO documents (
                    id, knowledge_base_id, filename, title, size, status, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (document_id, knowledge_base_id, safe_name, title, len(content), "uploaded", now),
            )
            connection.execute(
                """
                UPDATE knowledge_bases
                SET document_count = (
                    SELECT COUNT(*) FROM documents WHERE knowledge_base_id = ?
                ),
                index_status = ?, updated_at = ?
                WHERE id = ?
                """,
                (knowledge_base_id, "pending", now, knowledge_base_id),
            )
        return self._document_from_row(
            {
                "id": document_id,
                "knowledge_base_id": knowledge_base_id,
                "filename": safe_name,
                "title": title,
                "size": len(content),
                "status": "uploaded",
                "created_at": now,
            }
        )

    def create_index_job(self, knowledge_base_id: str) -> IndexJobRecord:
        self.require_knowledge_base(knowledge_base_id)
        now = time.time()
        job_id = f"job-{knowledge_base_id}-{uuid4().hex[:12]}"
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO index_jobs (
                    id, knowledge_base_id, status, message, created_at, finished_at
                )
                VALUES (?, ?, ?, ?, ?, NULL)
                """,
                (job_id, knowledge_base_id, "running", "正在构建知识索引", now),
            )
            connection.execute(
                "UPDATE knowledge_bases SET index_status = ?, updated_at = ? WHERE id = ?",
                ("building", now, knowledge_base_id),
            )

        try:
            index = build_index(self.settings_for(knowledge_base_id))
            index.save(self.index_dir(knowledge_base_id))
        except Exception as exc:
            message = f"索引构建失败：{exc}"
            status: JobStatus = "failed"
        else:
            message = "索引构建完成，知识库可用于问答。"
            status = "succeeded"

        finished_at = time.time()
        with self._lock, self._connect() as connection:
            connection.execute(
                "UPDATE index_jobs SET status = ?, message = ?, finished_at = ? WHERE id = ?",
                (status, message, finished_at, job_id),
            )
            connection.execute(
                """
                UPDATE knowledge_bases
                SET index_status = ?, last_indexed_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    "ready" if status == "succeeded" else "failed",
                    finished_at if status == "succeeded" else None,
                    finished_at,
                    knowledge_base_id,
                ),
            )
            if status == "succeeded":
                connection.execute(
                    "UPDATE documents SET status = ? WHERE knowledge_base_id = ?",
                    ("indexed", knowledge_base_id),
                )

        return self.get_job(job_id)  # type: ignore[return-value]

    def get_job(self, job_id: str) -> IndexJobRecord | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM index_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
        return self._job_from_row(row) if row else None

    def load_index(self, knowledge_base_id: str) -> KnowledgeIndex:
        return KnowledgeIndex.load(self.index_dir(knowledge_base_id))

    def settings_for(self, knowledge_base_id: str) -> Settings:
        settings = self._settings.model_copy(deep=True)
        settings.paths.raw_docs_dir = self.raw_dir(knowledge_base_id)
        settings.paths.index_dir = self.index_dir(knowledge_base_id)
        settings.paths.classifier_dir = self.classifier_dir(knowledge_base_id)
        return settings

    def raw_dir(self, knowledge_base_id: str) -> Path:
        path = self._kb_root / knowledge_base_id / "raw"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def index_dir(self, knowledge_base_id: str) -> Path:
        path = self._kb_root / knowledge_base_id / "index"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def classifier_dir(self, knowledge_base_id: str) -> Path:
        path = self._model_root / knowledge_base_id / "boundary_classifier"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    def _kb_from_row(row: sqlite3.Row) -> KnowledgeBaseRecord:
        return KnowledgeBaseRecord(
            id=str(row["id"]),
            name=str(row["name"]),
            description=str(row["description"]),
            status=row["status"],
            document_count=int(row["document_count"]),
            index_status=row["index_status"],
            last_indexed_at=row["last_indexed_at"],
            updated_at=float(row["updated_at"]),
            created_at=float(row["created_at"]),
        )

    @staticmethod
    def _document_from_row(row: sqlite3.Row | dict[str, object]) -> KnowledgeDocumentRecord:
        return KnowledgeDocumentRecord(
            id=str(row["id"]),
            knowledge_base_id=str(row["knowledge_base_id"]),
            filename=str(row["filename"]),
            title=str(row["title"]),
            size=int(row["size"]),
            status=str(row["status"]),
            created_at=float(row["created_at"]),
        )

    @staticmethod
    def _job_from_row(row: sqlite3.Row) -> IndexJobRecord:
        return IndexJobRecord(
            id=str(row["id"]),
            knowledge_base_id=str(row["knowledge_base_id"]),
            status=row["status"],
            message=str(row["message"]),
            created_at=float(row["created_at"]),
            finished_at=row["finished_at"],
        )

    def _create_layout(self, knowledge_base_id: str) -> None:
        self.raw_dir(knowledge_base_id)
        self.index_dir(knowledge_base_id)
        boundary_dir = self._kb_root / knowledge_base_id / "boundary"
        boundary_dir.mkdir(parents=True, exist_ok=True)
        (boundary_dir / "train.jsonl").touch(exist_ok=True)
        (boundary_dir / "review_queue.jsonl").touch(exist_ok=True)
        self.classifier_dir(knowledge_base_id)

    def _copy_legacy_sources(self, knowledge_base_id: str) -> None:
        for source in self._settings.paths.raw_docs_dir.glob("*"):
            if source.is_file() and source.suffix.lower() in {".md", ".txt"}:
                target = self.raw_dir(knowledge_base_id) / source.name
                if not target.exists():
                    shutil.copy2(source, target)
        if self._settings.paths.index_dir.exists():
            index_dir = self.index_dir(knowledge_base_id)
            for name in ("chunks.json", "embeddings.npy"):
                source = self._settings.paths.index_dir / name
                target = index_dir / name
                if source.exists() and not target.exists():
                    shutil.copy2(source, target)
        if self._settings.paths.classifier_dir.exists():
            classifier_dir = self.classifier_dir(knowledge_base_id)
            for source in self._settings.paths.classifier_dir.iterdir():
                target = classifier_dir / source.name
                if target.exists():
                    continue
                if source.is_file():
                    shutil.copy2(source, target)
                elif source.is_dir():
                    shutil.copytree(source, target)

    def _index_files_exist(self, knowledge_base_id: str) -> bool:
        index_dir = self.index_dir(knowledge_base_id)
        return (index_dir / "chunks.json").exists() and (index_dir / "embeddings.npy").exists()

    def _sync_documents(self, connection: sqlite3.Connection, knowledge_base_id: str) -> int:
        raw_dir = self.raw_dir(knowledge_base_id)
        existing_rows = connection.execute(
            "SELECT filename FROM documents WHERE knowledge_base_id = ?",
            (knowledge_base_id,),
        ).fetchall()
        existing = {str(row["filename"]) for row in existing_rows}
        now = time.time()
        for path in sorted(raw_dir.glob("*")):
            if not path.is_file() or path.suffix.lower() not in {".md", ".txt"}:
                continue
            if path.name in existing:
                continue
            content = path.read_text(encoding="utf-8", errors="ignore")
            connection.execute(
                """
                INSERT INTO documents (
                    id, knowledge_base_id, filename, title, size, status, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"doc-{knowledge_base_id}-{path.stem}",
                    knowledge_base_id,
                    path.name,
                    self._extract_title(path, content),
                    path.stat().st_size,
                    "indexed",
                    now,
                ),
            )
        count = connection.execute(
            "SELECT COUNT(*) AS count FROM documents WHERE knowledge_base_id = ?",
            (knowledge_base_id,),
        ).fetchone()["count"]
        connection.execute(
            "UPDATE knowledge_bases SET document_count = ? WHERE id = ?",
            (count, knowledge_base_id),
        )
        return int(count)

    @staticmethod
    def _slugify(name: str, now: float) -> str:
        slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", name.strip()).strip("-")
        if not slug:
            slug = "knowledge-base"
        return f"kb-{slug[:36].lower()}-{int(now)}-{uuid4().hex[:6]}"

    @staticmethod
    def _safe_filename(filename: str) -> str:
        name = Path(filename).name
        return re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff._-]+", "_", name)

    @staticmethod
    def _unique_file_path(directory: Path, filename: str) -> Path:
        candidate = directory / filename
        if not candidate.exists():
            return candidate

        stem = candidate.stem
        suffix = candidate.suffix
        for index in range(2, 10_000):
            next_candidate = directory / f"{stem}-{index}{suffix}"
            if not next_candidate.exists():
                return next_candidate
        return directory / f"{stem}-{uuid4().hex[:8]}{suffix}"

    @staticmethod
    def _extract_title(path: Path, text: str) -> str:
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                return stripped.lstrip("#").strip()
        return path.stem.replace("_", " ").replace("-", " ")
