from pathlib import Path

import pytest

from xyfrag.config import (
    AppConfig,
    BoundaryClassifierConfig,
    FrontendConfig,
    LLMConfig,
    PathConfig,
    RetrievalConfig,
    Settings,
)
from xyfrag.knowledge_base import DEFAULT_KNOWLEDGE_BASE_ID, KnowledgeBaseStore


def test_store_creates_default_and_migrates_legacy_assets(tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    settings.paths.raw_docs_dir.mkdir(parents=True)
    settings.paths.index_dir.mkdir(parents=True)
    settings.paths.classifier_dir.mkdir(parents=True)
    (settings.paths.raw_docs_dir / "legacy.md").write_text("# 校园卡\n挂失后补办。\n", encoding="utf-8")
    (settings.paths.index_dir / "chunks.json").write_text("[]", encoding="utf-8")
    (settings.paths.index_dir / "embeddings.npy").write_bytes(b"placeholder")
    (settings.paths.classifier_dir / "classifier.joblib").write_bytes(b"model")

    store = KnowledgeBaseStore(settings)
    default = store.default_knowledge_base()

    assert default.id == DEFAULT_KNOWLEDGE_BASE_ID
    assert default.index_status == "ready"
    assert default.document_count == 1
    assert (store.raw_dir(DEFAULT_KNOWLEDGE_BASE_ID) / "legacy.md").exists()
    assert (store.classifier_dir(DEFAULT_KNOWLEDGE_BASE_ID) / "classifier.joblib").exists()


def test_store_crud_upload_and_index_job(tmp_path: Path) -> None:
    store = KnowledgeBaseStore(make_settings(tmp_path))

    knowledge_base = store.create_knowledge_base("一卡通服务", "校园卡业务资料")
    updated = store.update_knowledge_base(knowledge_base.id, status="disabled")
    assert updated.status == "disabled"

    document = store.add_document(
        knowledge_base.id,
        "card.md",
        "# 校园卡\n校园卡丢失后应立即挂失并补办。\n".encode(),
    )
    assert document.filename == "card.md"
    assert store.get_knowledge_base(knowledge_base.id).index_status == "pending"  # type: ignore[union-attr]

    job = store.create_index_job(knowledge_base.id)
    assert job.status == "succeeded"
    assert store.get_knowledge_base(knowledge_base.id).index_status == "ready"  # type: ignore[union-attr]
    assert store.load_index(knowledge_base.id).chunks
    assert store.settings_for(knowledge_base.id).paths.raw_docs_dir == store.raw_dir(knowledge_base.id)


def test_store_boundary_items_crud(tmp_path: Path) -> None:
    store = KnowledgeBaseStore(make_settings(tmp_path))
    knowledge_base = store.create_knowledge_base("边界样本库", "边界训练")

    created = store.add_boundary_item(
        knowledge_base.id,
        "校园卡丢了怎么办？",
        1,
    )
    assert created.label == 1
    assert store.list_boundary_items(knowledge_base.id)[0].id == created.id

    updated = store.update_boundary_item(
        knowledge_base.id,
        created.id,
        "请推荐附近餐厅。",
        0,
        status="approved",
    )
    assert updated.text == "请推荐附近餐厅。"
    assert updated.label == 0

    store.delete_boundary_item(knowledge_base.id, created.id)
    assert store.list_boundary_items(knowledge_base.id) == []


def test_store_rejects_unsupported_or_empty_documents(tmp_path: Path) -> None:
    store = KnowledgeBaseStore(make_settings(tmp_path))
    knowledge_base = store.create_knowledge_base("规章制度")

    with pytest.raises(ValueError):
        store.add_document(knowledge_base.id, "rules.pdf", b"%PDF")

    with pytest.raises(ValueError):
        store.add_document(knowledge_base.id, "empty.txt", b"   ")


def make_settings(tmp_path: Path) -> Settings:
    return Settings(
        app=AppConfig(),
        paths=PathConfig(
            raw_docs_dir=tmp_path / "legacy" / "raw",
            index_dir=tmp_path / "legacy" / "index",
            classifier_dir=tmp_path / "legacy" / "classifier",
            knowledge_bases_dir=tmp_path / "data" / "knowledge_bases",
            knowledge_models_dir=tmp_path / "models" / "knowledge_bases",
            ops_db=tmp_path / "ops.sqlite3",
            log_file=tmp_path / "logs" / "xyfrag.log",
        ),
        boundary_classifier=BoundaryClassifierConfig(enabled=False),
        retrieval=RetrievalConfig(
            chunk_size=80,
            chunk_overlap=10,
            use_local_models=False,
            bm25_top_k=3,
            embedding_top_k=3,
            rerank_top_k=2,
        ),
        llm=LLMConfig(allow_mock_when_no_key=True),
        frontend=FrontendConfig(),
    )
