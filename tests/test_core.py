import asyncio
from pathlib import Path

import numpy as np

from xyfrag.config import RetrievalConfig
from xyfrag.embeddings import HashingEmbeddingBackend, create_embedding_backend
from xyfrag.index import KnowledgeIndex
from xyfrag.loader import DocumentLoader
from xyfrag.retriever import HybridRetriever
from xyfrag.reranker import LexicalOverlapReranker, create_reranker
from xyfrag.schemas import DocumentChunk
from xyfrag.service import NO_REFERENCE_MESSAGE, OUT_OF_SCOPE_MESSAGE, RAGService
from xyfrag.session import InMemorySessionStore


def test_loader_chunks_markdown(tmp_path: Path) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "guide.md").write_text(
        "# 校园卡\n校园卡丢失后应立即挂失并补办。\n",
        encoding="utf-8",
    )

    config = RetrievalConfig(chunk_size=20, chunk_overlap=5)
    chunks = DocumentLoader(raw, config).load()

    assert chunks
    assert chunks[0].title == "校园卡"
    assert chunks[0].doc_id == "guide"
    assert "挂失" in "".join(chunk.text for chunk in chunks)


def test_hash_embedding_shape_and_norm() -> None:
    backend = HashingEmbeddingBackend(dimension=32)
    vectors = backend.encode(["校园卡挂失", "补考申请"])

    assert vectors.shape == (2, 32)
    assert np.linalg.norm(vectors[0]) > 0


def test_bge_embedding_config_falls_back_without_optional_dependency() -> None:
    config = RetrievalConfig(
        embedding_backend="bge",
        embedding_model="/tmp/xyfrag-missing-bge-model",
        use_local_models=True,
        allow_model_fallback=True,
    )

    backend = create_embedding_backend(config)
    vectors = backend.encode(["校园卡挂失"])

    assert vectors.shape[0] == 1


def test_bge_reranker_config_falls_back_without_optional_dependency() -> None:
    config = RetrievalConfig(
        reranker_backend="bge",
        reranker_model="/tmp/xyfrag-missing-bge-reranker",
        use_local_models=True,
        allow_model_fallback=True,
    )

    reranker = create_reranker(config)

    assert reranker is not None


def test_hybrid_retriever_returns_relevant_chunk() -> None:
    config = RetrievalConfig(bm25_top_k=2, embedding_top_k=2, rerank_top_k=1)
    backend = HashingEmbeddingBackend()
    chunks = [
        DocumentChunk("card", "card-1", "校园卡", "校园卡丢失后应立即挂失。", {}),
        DocumentChunk("exam", "exam-1", "补考", "补考申请在开学前两周提交。", {}),
    ]
    index = KnowledgeIndex(chunks=chunks, embeddings=backend.encode([chunk.text for chunk in chunks]))
    candidates = HybridRetriever(index, backend, config).retrieve("校园卡丢了怎么办")
    reranked = LexicalOverlapReranker(top_k=1).rerank("校园卡丢了怎么办", candidates)

    assert reranked[0].chunk.doc_id == "card"


def test_stream_chat_out_of_scope_without_llm() -> None:
    service = make_service([])
    service._classifier.decide = lambda query: type(  # type: ignore[method-assign]
        "Decision",
        (),
        {"is_in_scope": False, "probability": 0.1, "reason": "test"},
    )()

    events = asyncio.run(collect_stream(service, "session-1", "讲个笑话"))

    assert events[-1].type == "final"
    assert events[-1].payload["answer"] == OUT_OF_SCOPE_MESSAGE
    assert events[-1].payload["error_code"] == "OUT_OF_SCOPE"


def test_chat_no_reference_returns_standard_message() -> None:
    service = make_service([])
    result = asyncio.run(service.chat("session-1", "校园卡怎么办"))

    assert result.answer == NO_REFERENCE_MESSAGE
    assert result.error_code == "NO_REFERENCE"
    assert result.used_llm is False


async def collect_stream(service: RAGService, session_id: str, query: str):
    return [event async for event in service.stream_chat(session_id, query)]


def make_service(chunks: list[DocumentChunk]) -> RAGService:
    config = RetrievalConfig(use_local_models=False)
    backend = HashingEmbeddingBackend()
    embeddings = backend.encode([chunk.text for chunk in chunks]) if chunks else np.empty((0, 384))
    index = KnowledgeIndex(chunks=chunks, embeddings=embeddings)

    from xyfrag.config import (
        AppConfig,
        BoundaryClassifierConfig,
        FrontendConfig,
        LLMConfig,
        PathConfig,
        Settings,
    )

    settings = Settings(
        app=AppConfig(),
        paths=PathConfig(),
        boundary_classifier=BoundaryClassifierConfig(enabled=False),
        retrieval=config,
        llm=LLMConfig(allow_mock_when_no_key=True),
        frontend=FrontendConfig(),
    )
    return RAGService(settings, index, InMemorySessionStore())
