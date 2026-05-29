"""End-to-end RAG orchestration service."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from collections.abc import AsyncIterator
from typing import Literal, Optional

from xyfrag.classifier import BoundaryClassifier, BoundaryDecision
from xyfrag.config import Settings
from xyfrag.embeddings import create_embedding_backend
from xyfrag.index import KnowledgeIndex
from xyfrag.llm import LLMClientError, OpenAICompatibleClient, build_mock_grounded_answer
from xyfrag.prompts import build_answer_messages, build_rewrite_messages
from xyfrag.reranker import Reranker, create_reranker
from xyfrag.retriever import HybridRetriever
from xyfrag.schemas import ChatMessage, RetrievedDocument
from xyfrag.session import InMemorySessionStore

logger = logging.getLogger(__name__)

OUT_OF_SCOPE_MESSAGE = "该问题超出校园资料库范围，建议咨询相关行政部门。"
NO_REFERENCE_MESSAGE = "资料库中未找到相关规定。"

ErrorCode = Literal[
    "BACKEND_UNAVAILABLE",
    "LLM_TIMEOUT",
    "NO_REFERENCE",
    "OUT_OF_SCOPE",
]


@dataclass(frozen=True)
class SourcePayload:
    """Source citation payload returned by the API.

    Args:
        index: Citation index.
        doc_id: Source document ID.
        chunk_id: Source chunk ID.
        title: Source title.
        score: Rerank score.
        text: Source text.
    """

    index: int
    doc_id: str
    chunk_id: str
    title: str
    score: float
    text: str


@dataclass(frozen=True)
class ChatResult:
    """Result returned by the RAG service.

    Args:
        answer: Assistant answer.
        session_id: Conversation session ID.
        rewritten_query: Query used for retrieval.
        boundary: Boundary classifier decision.
        sources: Source payloads.
        llm_elapsed_seconds: Answer-generation latency.
        total_elapsed_seconds: End-to-end latency.
        used_llm: Whether any LLM call was made.
        error: Optional error message.
    """

    answer: str
    session_id: str
    rewritten_query: str
    boundary: BoundaryDecision
    sources: list[SourcePayload]
    llm_elapsed_seconds: float
    total_elapsed_seconds: float
    used_llm: bool
    error_code: Optional[str] = None
    error: Optional[str] = None


@dataclass(frozen=True)
class StreamEvent:
    """NDJSON chat stream event."""

    type: Literal["status", "delta", "final", "error"]
    payload: dict[str, object]


class RAGService:
    """Coordinate classification, rewriting, retrieval, reranking, and answering."""

    def __init__(
        self,
        settings: Settings,
        knowledge_index: KnowledgeIndex,
        sessions: InMemorySessionStore,
    ) -> None:
        """Initialize the RAG service.

        Args:
            settings: Application settings.
            knowledge_index: Loaded retrieval index.
            sessions: Session history store.

        Returns:
            None.
        """

        self._settings = settings
        self._sessions = sessions
        self._classifier = BoundaryClassifier(
            settings.paths.classifier_dir,
            settings.boundary_classifier,
        )
        self._embedding_backend = create_embedding_backend(settings.retrieval)
        self._retriever = HybridRetriever(
            knowledge_index,
            self._embedding_backend,
            settings.retrieval,
        )
        self._reranker: Reranker = create_reranker(settings.retrieval)
        self._llm_client = OpenAICompatibleClient(settings.llm)

    async def chat(
        self,
        session_id: str,
        query: str,
        request_id: Optional[str] = None,
    ) -> ChatResult:
        """Run the full chat pipeline.

        Args:
            session_id: Conversation session ID.
            query: Latest user question.

        Returns:
            Chat result with answer and citations.
        """

        started_at = time.perf_counter()
        log_context = self._log_context(request_id, session_id)
        logger.info("%s stage=received query=%s", log_context, query)
        boundary = self._classifier.decide(query)
        if not boundary.is_in_scope:
            total_elapsed = time.perf_counter() - started_at
            logger.info(
                "%s stage=boundary elapsed_ms=%.1f rejected=true probability=%.3f",
                log_context,
                total_elapsed * 1000,
                boundary.probability,
            )
            self._sessions.append(session_id, "user", query)
            self._sessions.append(session_id, "assistant", OUT_OF_SCOPE_MESSAGE)
            return ChatResult(
                answer=OUT_OF_SCOPE_MESSAGE,
                session_id=session_id,
                rewritten_query=query,
                boundary=boundary,
                sources=[],
                llm_elapsed_seconds=0.0,
                total_elapsed_seconds=total_elapsed,
                used_llm=False,
                error_code="OUT_OF_SCOPE",
            )

        history = self._sessions.get_history(session_id)
        rewritten_query, rewrite_used_llm = await self._rewrite_query(history, query)
        logger.info("%s stage=rewrite rewritten=%s", log_context, rewritten_query)
        candidates = self._retriever.retrieve(rewritten_query)
        logger.info("%s stage=retrieve candidates=%d", log_context, len(candidates))
        documents = self._reranker.rerank(rewritten_query, candidates)
        logger.info("%s stage=rerank documents=%d", log_context, len(documents))
        sources = self._to_sources(documents)

        if not documents:
            answer = NO_REFERENCE_MESSAGE
            self._sessions.append(session_id, "user", query)
            self._sessions.append(session_id, "assistant", answer)
            return ChatResult(
                answer=answer,
                session_id=session_id,
                rewritten_query=rewritten_query,
                boundary=boundary,
                sources=[],
                llm_elapsed_seconds=0.0,
                total_elapsed_seconds=time.perf_counter() - started_at,
                used_llm=rewrite_used_llm,
                error_code="NO_REFERENCE",
            )

        if self._should_use_mock_answer():
            answer = build_mock_grounded_answer(query, documents)
            self._sessions.append(session_id, "user", query)
            self._sessions.append(session_id, "assistant", answer)
            return ChatResult(
                answer=answer,
                session_id=session_id,
                rewritten_query=rewritten_query,
                boundary=boundary,
                sources=sources,
                llm_elapsed_seconds=0.0,
                total_elapsed_seconds=time.perf_counter() - started_at,
                used_llm=False,
            )

        try:
            answer_response = await self._llm_client.chat(
                build_answer_messages(query, documents)
            )
        except LLMClientError as exc:
            return ChatResult(
                answer="服务暂时无法生成回答，请稍后重试。",
                session_id=session_id,
                rewritten_query=rewritten_query,
                boundary=boundary,
                sources=sources,
                llm_elapsed_seconds=0.0,
                total_elapsed_seconds=time.perf_counter() - started_at,
                used_llm=True,
                error_code=self._error_code_for_llm(exc),
                error=str(exc),
            )

        self._sessions.append(session_id, "user", query)
        self._sessions.append(session_id, "assistant", answer_response.content)
        logger.info(
            "%s stage=complete docs=%s llm_elapsed=%.3fs total=%.3fs",
            log_context,
            [source.chunk_id for source in sources],
            answer_response.elapsed_seconds,
            time.perf_counter() - started_at,
        )
        return ChatResult(
            answer=answer_response.content,
            session_id=session_id,
            rewritten_query=rewritten_query,
            boundary=boundary,
            sources=sources,
            llm_elapsed_seconds=answer_response.elapsed_seconds,
            total_elapsed_seconds=time.perf_counter() - started_at,
            used_llm=True,
        )

    async def stream_chat(
        self,
        session_id: str,
        query: str,
        request_id: Optional[str] = None,
    ) -> AsyncIterator[StreamEvent]:
        """Run chat and emit user-facing progress plus answer deltas.

        Args:
            session_id: Conversation session ID.
            query: Latest user question.
            request_id: Request correlation ID.

        Yields:
            Status, delta, final, or error stream events.
        """

        started_at = time.perf_counter()
        log_context = self._log_context(request_id, session_id)
        yield self._status("boundary", "正在判断问题范围")
        logger.info("%s stage=stream_received query=%s", log_context, query)
        boundary = self._classifier.decide(query)

        if not boundary.is_in_scope:
            logger.info("%s stage=stream_out_of_scope", log_context)
            self._sessions.append(session_id, "user", query)
            self._sessions.append(session_id, "assistant", OUT_OF_SCOPE_MESSAGE)
            result = ChatResult(
                answer=OUT_OF_SCOPE_MESSAGE,
                session_id=session_id,
                rewritten_query=query,
                boundary=boundary,
                sources=[],
                llm_elapsed_seconds=0.0,
                total_elapsed_seconds=time.perf_counter() - started_at,
                used_llm=False,
                error_code="OUT_OF_SCOPE",
            )
            yield self._status("complete", "问题超出资料库范围")
            yield self._final_event(result)
            return

        yield self._status("rewrite", "正在改写检索问题")
        history = self._sessions.get_history(session_id)
        rewritten_query, rewrite_used_llm = await self._rewrite_query(history, query)
        yield self._status("retrieve", "正在检索知识库")
        candidates = self._retriever.retrieve(rewritten_query)
        yield self._status("rerank", "正在重排引用资料")
        documents = self._reranker.rerank(rewritten_query, candidates)
        sources = self._to_sources(documents)

        if not documents:
            result = ChatResult(
                answer=NO_REFERENCE_MESSAGE,
                session_id=session_id,
                rewritten_query=rewritten_query,
                boundary=boundary,
                sources=[],
                llm_elapsed_seconds=0.0,
                total_elapsed_seconds=time.perf_counter() - started_at,
                used_llm=rewrite_used_llm,
                error_code="NO_REFERENCE",
            )
            self._sessions.append(session_id, "user", query)
            self._sessions.append(session_id, "assistant", NO_REFERENCE_MESSAGE)
            yield self._error_event(
                "NO_REFERENCE",
                NO_REFERENCE_MESSAGE,
                retryable=False,
                result=result,
            )
            yield self._final_event(result)
            return

        yield self._status("generate", "正在生成回答")
        if self._should_use_mock_answer():
            answer = build_mock_grounded_answer(query, documents)
            result = ChatResult(
                answer=answer,
                session_id=session_id,
                rewritten_query=rewritten_query,
                boundary=boundary,
                sources=sources,
                llm_elapsed_seconds=0.0,
                total_elapsed_seconds=time.perf_counter() - started_at,
                used_llm=False,
            )
        else:
            try:
                answer_response = await self._llm_client.chat(
                    build_answer_messages(query, documents)
                )
            except LLMClientError as exc:
                result = ChatResult(
                    answer="服务暂时无法生成回答，请稍后重试。",
                    session_id=session_id,
                    rewritten_query=rewritten_query,
                    boundary=boundary,
                    sources=sources,
                    llm_elapsed_seconds=0.0,
                    total_elapsed_seconds=time.perf_counter() - started_at,
                    used_llm=True,
                    error_code=self._error_code_for_llm(exc),
                    error=str(exc),
                )
                yield self._error_event(
                    result.error_code or "BACKEND_UNAVAILABLE",
                    result.answer,
                    retryable=True,
                    result=result,
                )
                yield self._final_event(result)
                return

            result = ChatResult(
                answer=answer_response.content,
                session_id=session_id,
                rewritten_query=rewritten_query,
                boundary=boundary,
                sources=sources,
                llm_elapsed_seconds=answer_response.elapsed_seconds,
                total_elapsed_seconds=time.perf_counter() - started_at,
                used_llm=True,
            )

        self._sessions.append(session_id, "user", query)
        self._sessions.append(session_id, "assistant", result.answer)
        for chunk in self._chunk_answer(result.answer):
            yield StreamEvent(type="delta", payload={"text": chunk})
        yield self._status("complete", "回答完成")
        yield self._final_event(result)

    async def _rewrite_query(
        self,
        history: list[ChatMessage],
        query: str,
    ) -> tuple[str, bool]:
        """Rewrite a contextual query into a standalone retrieval query.

        Args:
            history: Session history messages.
            query: Latest user question.

        Returns:
            Rewritten query and whether an LLM call was made.
        """

        if not history:
            return query, False

        try:
            response = await self._llm_client.chat(build_rewrite_messages(history, query))
        except LLMClientError as exc:
            logger.error("Query rewrite failed; using original query: %s", exc)
            return query, True

        return response.content or query, True

    def _should_use_mock_answer(self) -> bool:
        """Return whether the local extractive answer path should be used.

        Args:
            None.

        Returns:
            Whether to use the mock grounded answer instead of the LLM.
        """

        return (
            self._settings.llm.allow_mock_when_no_key
            and not os.getenv("OPENAI_API_KEY")
        )

    @staticmethod
    def _log_context(request_id: Optional[str], session_id: str) -> str:
        """Build compact structured log context."""

        return f"request_id={request_id or '-'} session_id={session_id}"

    @staticmethod
    def _status(stage: str, message: str) -> StreamEvent:
        """Build a status stream event."""

        return StreamEvent(
            type="status",
            payload={
                "stage": stage,
                "message": message,
                "ts": time.time(),
            },
        )

    @staticmethod
    def _error_event(
        code: str,
        message: str,
        retryable: bool,
        result: ChatResult,
    ) -> StreamEvent:
        """Build a stream error event."""

        return StreamEvent(
            type="error",
            payload={
                "code": code,
                "message": message,
                "retryable": retryable,
                "session_id": result.session_id,
            },
        )

    @staticmethod
    def _final_event(result: ChatResult) -> StreamEvent:
        """Build the final stream event."""

        return StreamEvent(
            type="final",
            payload={
                "answer": result.answer,
                "session_id": result.session_id,
                "rewritten_query": result.rewritten_query,
                "boundary": {
                    "is_in_scope": result.boundary.is_in_scope,
                    "probability": result.boundary.probability,
                    "reason": result.boundary.reason,
                },
                "sources": [
                    {
                        "index": source.index,
                        "doc_id": source.doc_id,
                        "chunk_id": source.chunk_id,
                        "title": source.title,
                        "score": source.score,
                        "text": source.text,
                    }
                    for source in result.sources
                ],
                "used_llm": result.used_llm,
                "timings": {
                    "llm_elapsed_seconds": result.llm_elapsed_seconds,
                    "total_elapsed_seconds": result.total_elapsed_seconds,
                },
                "error_code": result.error_code,
                "error": result.error,
            },
        )

    @staticmethod
    def _chunk_answer(answer: str, chunk_size: int = 12) -> list[str]:
        """Split answer text into small display chunks."""

        if not answer:
            return []
        return [
            answer[index : index + chunk_size]
            for index in range(0, len(answer), chunk_size)
        ]

    @staticmethod
    def _error_code_for_llm(exc: LLMClientError) -> ErrorCode:
        """Map provider errors to stable frontend error codes."""

        if "超时" in str(exc) or "timed out" in str(exc).lower():
            return "LLM_TIMEOUT"
        return "BACKEND_UNAVAILABLE"

    @staticmethod
    def _to_sources(documents: list[RetrievedDocument]) -> list[SourcePayload]:
        """Convert reranked documents to serializable source payloads.

        Args:
            documents: Reranked source documents.

        Returns:
            Source payload list.
        """

        return [
            SourcePayload(
                index=document.source_index,
                doc_id=document.chunk.doc_id,
                chunk_id=document.chunk.chunk_id,
                title=document.chunk.title,
                score=document.score,
                text=document.chunk.text,
            )
            for document in documents
        ]
