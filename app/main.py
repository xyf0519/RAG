"""FastAPI backend for xyfRAG."""

from __future__ import annotations

import logging
import json
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from typing import Any, Optional, Union
from uuid import uuid4

from fastapi import FastAPI, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from xyfrag.config import get_settings
from xyfrag.index import KnowledgeIndex, build_index
from xyfrag.logging_config import configure_logging
from xyfrag.service import RAGService
from xyfrag.session import InMemorySessionStore

logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    """Chat request payload."""

    query: str = Field(min_length=1, max_length=2000)
    session_id: Optional[str] = None


class SourceResponse(BaseModel):
    """Source citation response payload."""

    index: int
    doc_id: str
    chunk_id: str
    title: str
    score: float
    text: str


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


class HealthResponse(BaseModel):
    """Service health response payload."""

    ok: bool
    app: str


class ErrorResponse(BaseModel):
    """Graceful JSON error response."""

    ok: bool = False
    error: str
    error_code: str = "BACKEND_UNAVAILABLE"


def _load_or_build_index() -> KnowledgeIndex:
    """Load the retrieval index, building it from raw docs when missing.

    Args:
        None.

    Returns:
        Loaded knowledge index.

    Raises:
        RuntimeError: If loading and building both fail.
    """

    settings = get_settings()
    try:
        return KnowledgeIndex.load(settings.paths.index_dir)
    except (FileNotFoundError, ValueError) as exc:
        logger.info("Index unavailable, building from raw docs: %s", exc)

    try:
        index = build_index(settings)
        index.save(settings.paths.index_dir)
        return index
    except Exception as exc:
        logger.error("Unable to build retrieval index: %s", exc)
        raise RuntimeError("检索索引初始化失败，请检查知识库文档。") from exc


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
    knowledge_index = _load_or_build_index()
    app.state.sessions = InMemorySessionStore()
    app.state.rag_service = RAGService(
        settings=settings,
        knowledge_index=knowledge_index,
        sessions=app.state.sessions,
    )
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
    service: RAGService = app.state.rag_service

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
            )
            for source in result.sources
        ],
        used_llm=result.used_llm,
        llm_elapsed_seconds=result.llm_elapsed_seconds,
        total_elapsed_seconds=result.total_elapsed_seconds,
        error_code=result.error_code,
        error=result.error,
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
    service: RAGService = app.state.rag_service

    async def events() -> AsyncIterator[str]:
        try:
            async for event in service.stream_chat(
                session_id=session_id,
                query=request.query.strip(),
                request_id=request_id,
            ):
                yield json.dumps(
                    {"type": event.type, "payload": event.payload},
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
