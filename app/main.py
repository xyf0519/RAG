"""FastAPI backend for xyfRAG."""

from __future__ import annotations

import logging
import json
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from typing import Any, Optional, Union
from uuid import uuid4

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from xyfrag.config import get_settings
from xyfrag.knowledge_base import (
    DEFAULT_KNOWLEDGE_BASE_ID,
    IndexJobRecord,
    KnowledgeBaseRecord,
    KnowledgeBaseStore,
    KnowledgeDocumentRecord,
)
from xyfrag.logging_config import configure_logging
from xyfrag.service import RAGService
from xyfrag.session import InMemorySessionStore

logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    """Chat request payload."""

    query: str = Field(min_length=1, max_length=2000)
    session_id: Optional[str] = None
    knowledge_base_id: Optional[str] = None


class SourceResponse(BaseModel):
    """Source citation response payload."""

    index: int
    doc_id: str
    chunk_id: str
    title: str
    score: float
    text: str
    knowledge_base_id: Optional[str] = None


class BoundaryResponse(BaseModel):
    """Boundary classifier response payload."""

    is_in_scope: bool
    probability: float
    reason: str


class ChatResponse(BaseModel):
    """Chat response payload."""

    ok: bool
    answer: str
    session_id: str
    rewritten_query: str
    boundary: BoundaryResponse
    sources: list[SourceResponse]
    used_llm: bool
    llm_elapsed_seconds: float
    total_elapsed_seconds: float
    error_code: Optional[str] = None
    error: Optional[str] = None
    knowledge_base_id: str = DEFAULT_KNOWLEDGE_BASE_ID


class HealthResponse(BaseModel):
    """Service health response payload."""

    ok: bool
    app: str


class ErrorResponse(BaseModel):
    """Graceful JSON error response."""

    ok: bool = False
    error: str
    error_code: str = "BACKEND_UNAVAILABLE"


class KnowledgeBaseCreateRequest(BaseModel):
    """Create a local knowledge base."""

    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)


class KnowledgeBaseUpdateRequest(BaseModel):
    """Update knowledge-base metadata."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    description: Optional[str] = Field(default=None, max_length=300)
    status: Optional[str] = None


class KnowledgeBaseResponse(BaseModel):
    id: str
    name: str
    description: str
    status: str
    document_count: int
    index_status: str
    last_indexed_at: Optional[float] = None
    updated_at: float
    created_at: float


class KnowledgeDocumentResponse(BaseModel):
    id: str
    knowledge_base_id: str
    filename: str
    title: str
    size: int
    status: str
    created_at: float


class IndexJobResponse(BaseModel):
    id: str
    knowledge_base_id: str
    status: str
    message: str
    created_at: float
    finished_at: Optional[float] = None


def _service_for_knowledge_base(app: FastAPI, knowledge_base_id: str | None) -> RAGService:
    """Return a RAG service scoped to one knowledge base.

    Args:
        app: FastAPI application.
        knowledge_base_id: Optional knowledge-base id.

    Returns:
        RAG service for the requested knowledge base.
    """

    try:
        knowledge_base = app.state.knowledge_store.require_knowledge_base(knowledge_base_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在。") from exc

    if knowledge_base.status != "active":
        raise HTTPException(status_code=409, detail="知识库已停用。")
    if knowledge_base.index_status != "ready":
        raise HTTPException(status_code=409, detail="知识库尚未完成索引构建。")

    services: dict[str, RAGService] = app.state.rag_services
    if knowledge_base.id not in services:
        store: KnowledgeBaseStore = app.state.knowledge_store
        try:
            knowledge_index = store.load_index(knowledge_base.id)
        except Exception as exc:
            raise HTTPException(status_code=409, detail="知识库尚未完成索引构建。") from exc
        services[knowledge_base.id] = RAGService(
            settings=store.settings_for(knowledge_base.id),
            knowledge_index=knowledge_index,
            sessions=app.state.sessions,
        )
    return services[knowledge_base.id]


def _invalidate_service(app: FastAPI, knowledge_base_id: str) -> None:
    services: dict[str, RAGService] = app.state.rag_services
    services.pop(knowledge_base_id, None)


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    """Initialize shared service state for FastAPI.

    Args:
        app: FastAPI application instance.

    Yields:
        None.
    """

    settings = get_settings()
    configure_logging(settings)
    app.state.sessions = InMemorySessionStore()
    app.state.knowledge_store = KnowledgeBaseStore(settings)
    app.state.rag_services = {}
    yield


app = FastAPI(title="xyfRAG", version="0.1.0", lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Return API health status.

    Args:
        None.

    Returns:
        Health response.
    """

    settings = get_settings()
    return HealthResponse(ok=True, app=settings.app.name)


@app.post("/chat", response_model=Union[ChatResponse, ErrorResponse])
async def chat(
    request: ChatRequest,
    x_request_id: Optional[str] = Header(default=None),
) -> Union[ChatResponse, ErrorResponse]:
    """Run the RAG chat pipeline.

    Args:
        request: Chat request payload.

    Returns:
        Chat response or graceful JSON error.
    """

    session_id = request.session_id or str(uuid4())
    request_id = x_request_id or str(uuid4())
    service = _service_for_knowledge_base(app, request.knowledge_base_id)
    knowledge_base = app.state.knowledge_store.require_knowledge_base(request.knowledge_base_id)

    try:
        result = await service.chat(
            session_id=session_id,
            query=request.query.strip(),
            request_id=request_id,
        )
    except Exception as exc:
        logger.error(
            "request_id=%s session_id=%s stage=chat_error error=%s",
            request_id,
            session_id,
            exc,
            exc_info=True,
        )
        return ErrorResponse(error="服务处理失败，请稍后重试。")

    return ChatResponse(
        ok=result.error is None,
        answer=result.answer,
        session_id=result.session_id,
        rewritten_query=result.rewritten_query,
        boundary=BoundaryResponse(
            is_in_scope=result.boundary.is_in_scope,
            probability=result.boundary.probability,
            reason=result.boundary.reason,
        ),
        sources=[
            SourceResponse(
                index=source.index,
                doc_id=source.doc_id,
                chunk_id=source.chunk_id,
                title=source.title,
                score=source.score,
                text=source.text,
                knowledge_base_id=knowledge_base.id,
            )
            for source in result.sources
        ],
        used_llm=result.used_llm,
        llm_elapsed_seconds=result.llm_elapsed_seconds,
        total_elapsed_seconds=result.total_elapsed_seconds,
        error_code=result.error_code,
        error=result.error,
        knowledge_base_id=knowledge_base.id,
    )


@app.post("/api/v1/chat/stream")
async def chat_stream(
    request: ChatRequest,
    x_request_id: Optional[str] = Header(default=None),
) -> StreamingResponse:
    """Run the RAG chat pipeline as newline-delimited JSON events.

    Args:
        request: Chat request payload.
        x_request_id: Optional correlation ID propagated by the BFF.

    Returns:
        Streaming response with `application/x-ndjson` media type.
    """

    session_id = request.session_id or str(uuid4())
    request_id = x_request_id or str(uuid4())
    service = _service_for_knowledge_base(app, request.knowledge_base_id)
    knowledge_base = app.state.knowledge_store.require_knowledge_base(request.knowledge_base_id)

    async def events() -> AsyncIterator[str]:
        try:
            async for event in service.stream_chat(
                session_id=session_id,
                query=request.query.strip(),
                request_id=request_id,
            ):
                payload = dict(event.payload)
                if event.type == "final":
                    payload["knowledge_base_id"] = knowledge_base.id
                    payload["sources"] = [
                        {
                            **source,
                            "knowledge_base_id": knowledge_base.id,
                        }
                        for source in payload.get("sources", [])
                    ]
                yield json.dumps(
                    {
                        "type": event.type,
                        "payload": payload,
                    },
                    ensure_ascii=False,
                ) + "\n"
        except Exception as exc:
            logger.error(
                "request_id=%s session_id=%s stage=stream_error error=%s",
                request_id,
                session_id,
                exc,
                exc_info=True,
            )
            yield json.dumps(
                {
                    "type": "error",
                    "payload": {
                        "code": "BACKEND_UNAVAILABLE",
                        "message": "服务处理失败，请稍后重试。",
                        "retryable": True,
                        "session_id": session_id,
                    },
                },
                ensure_ascii=False,
            ) + "\n"

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"X-Request-ID": request_id},
    )


@app.get("/api/v1/knowledge-bases", response_model=list[KnowledgeBaseResponse])
async def list_knowledge_bases() -> list[KnowledgeBaseResponse]:
    store: KnowledgeBaseStore = app.state.knowledge_store
    return [_kb_response(item) for item in store.list_knowledge_bases()]


@app.post("/api/v1/knowledge-bases", response_model=KnowledgeBaseResponse)
async def create_knowledge_base(
    request: KnowledgeBaseCreateRequest,
) -> KnowledgeBaseResponse:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        knowledge_base = store.create_knowledge_base(request.name, request.description)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _kb_response(knowledge_base)


@app.patch("/api/v1/knowledge-bases/{knowledge_base_id}", response_model=KnowledgeBaseResponse)
async def update_knowledge_base(
    knowledge_base_id: str,
    request: KnowledgeBaseUpdateRequest,
) -> KnowledgeBaseResponse:
    store: KnowledgeBaseStore = app.state.knowledge_store
    if request.status is not None and request.status not in {"active", "disabled"}:
        raise HTTPException(status_code=400, detail="知识库状态不正确。")
    try:
        knowledge_base = store.update_knowledge_base(
            knowledge_base_id,
            name=request.name,
            description=request.description,
            status=request.status,  # type: ignore[arg-type]
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在。") from exc
    _invalidate_service(app, knowledge_base_id)
    return _kb_response(knowledge_base)


@app.get(
    "/api/v1/knowledge-bases/{knowledge_base_id}/documents",
    response_model=list[KnowledgeDocumentResponse],
)
async def list_documents(knowledge_base_id: str) -> list[KnowledgeDocumentResponse]:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        return [_document_response(item) for item in store.list_documents(knowledge_base_id)]
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在。") from exc


@app.post(
    "/api/v1/knowledge-bases/{knowledge_base_id}/documents",
    response_model=list[KnowledgeDocumentResponse],
)
async def upload_documents(
    knowledge_base_id: str,
    files: list[UploadFile] = File(...),
) -> list[KnowledgeDocumentResponse]:
    store: KnowledgeBaseStore = app.state.knowledge_store
    documents: list[KnowledgeDocumentResponse] = []
    try:
        for file in files:
            content = await file.read()
            documents.append(
                _document_response(
                    store.add_document(
                        knowledge_base_id,
                        file.filename or "document.txt",
                        content,
                    )
                )
            )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在。") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _invalidate_service(app, knowledge_base_id)
    return documents


@app.post(
    "/api/v1/knowledge-bases/{knowledge_base_id}/index-jobs",
    response_model=IndexJobResponse,
)
async def create_index_job(knowledge_base_id: str) -> IndexJobResponse:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        job = store.create_index_job(knowledge_base_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在。") from exc
    _invalidate_service(app, knowledge_base_id)
    return _job_response(job)


@app.get("/api/v1/jobs/{job_id}", response_model=IndexJobResponse)
async def get_job(job_id: str) -> IndexJobResponse:
    store: KnowledgeBaseStore = app.state.knowledge_store
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在。")
    return _job_response(job)


@app.delete("/sessions/{session_id}", response_model=dict[str, bool])
async def clear_session(session_id: str) -> dict[str, bool]:
    """Clear one chat session.

    Args:
        session_id: Session identifier.

    Returns:
        Operation status.
    """

    sessions: InMemorySessionStore = app.state.sessions
    sessions.clear(session_id)
    return {"ok": True}


def _kb_response(record: KnowledgeBaseRecord) -> KnowledgeBaseResponse:
    return KnowledgeBaseResponse(**record.__dict__)


def _document_response(record: KnowledgeDocumentRecord) -> KnowledgeDocumentResponse:
    return KnowledgeDocumentResponse(**record.__dict__)


def _job_response(record: IndexJobRecord) -> IndexJobResponse:
    return IndexJobResponse(**record.__dict__)
