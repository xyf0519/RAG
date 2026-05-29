"""End-to-end RAG orchestration service."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

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
    error: Optional[str] = None


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

    async def chat(self, session_id: str, query: str) -> ChatResult:
        """Run the full chat pipeline.

        Args:
            session_id: Conversation session ID.
            query: Latest user question.

        Returns:
            Chat result with answer and citations.
        """

        started_at = time.perf_counter()
        logger.info("User query session=%s query=%s", session_id, query)
        boundary = self._classifier.decide(query)
        if not boundary.is_in_scope:
            total_elapsed = time.perf_counter() - started_at
            logger.info(
                "Boundary rejected query session=%s probability=%.3f",
                session_id,
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
            )

        history = self._sessions.get_history(session_id)
        rewritten_query, rewrite_used_llm = await self._rewrite_query(history, query)
        candidates = self._retriever.retrieve(rewritten_query)
        documents = self._reranker.rerank(rewritten_query, candidates)
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
                error=str(exc),
            )

        self._sessions.append(session_id, "user", query)
        self._sessions.append(session_id, "assistant", answer_response.content)
        logger.info(
            "Answer complete session=%s docs=%s llm_elapsed=%.3fs total=%.3fs",
            session_id,
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
