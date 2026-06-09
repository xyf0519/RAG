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
from xyfrag.knowledge_base import (
    DEFAULT_KNOWLEDGE_BASE_ID,
    DISABLED_CLASSIFIER_MODEL_ID,
    KnowledgeBaseStore,
)


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


def test_store_deletes_document_and_invalidates_index(tmp_path: Path) -> None:
    store = KnowledgeBaseStore(make_settings(tmp_path))
    knowledge_base = store.create_knowledge_base("规章制度")
    document = store.add_document(
        knowledge_base.id,
        "rules.md",
        "# 规章制度\n请遵守校园管理规定。\n".encode(),
    )
    job = store.create_index_job(knowledge_base.id)
    assert job.status == "succeeded"
    assert (store.raw_dir(knowledge_base.id) / "rules.md").exists()
    assert (store.index_dir(knowledge_base.id) / "chunks.json").exists()

    updated = store.delete_document(knowledge_base.id, document.id)

    assert updated.document_count == 0
    assert updated.index_status == "not_indexed"
    assert store.list_documents(knowledge_base.id) == []
    assert not (store.raw_dir(knowledge_base.id) / "rules.md").exists()
    assert not (store.index_dir(knowledge_base.id) / "chunks.json").exists()
    assert not (store.index_dir(knowledge_base.id) / "embeddings.npy").exists()
    with pytest.raises(FileNotFoundError):
        store.load_index(knowledge_base.id)


def test_store_deletes_knowledge_base_assets_and_records(tmp_path: Path) -> None:
    store = KnowledgeBaseStore(make_settings(tmp_path))
    knowledge_base = store.create_knowledge_base("临时资料库")
    store.add_document(
        knowledge_base.id,
        "rules.md",
        "# 临时资料库\n请遵守校园管理规定。\n".encode(),
    )
    store.add_boundary_item(knowledge_base.id, "校园卡丢了怎么办？", 1)
    job = store.create_index_job(knowledge_base.id)
    assert job.status == "succeeded"
    kb_root = store._kb_root / knowledge_base.id
    model_root = store._model_root / knowledge_base.id
    assert kb_root.exists()
    assert model_root.exists()

    store.delete_knowledge_base(knowledge_base.id)

    assert store.get_knowledge_base(knowledge_base.id) is None
    assert not kb_root.exists()
    assert not model_root.exists()
    with pytest.raises(KeyError):
        store.delete_knowledge_base(knowledge_base.id)
    with pytest.raises(ValueError):
        store.delete_knowledge_base(DEFAULT_KNOWLEDGE_BASE_ID)


def test_store_keeps_deleted_legacy_document_deleted(tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    settings.paths.raw_docs_dir.mkdir(parents=True)
    settings.paths.index_dir.mkdir(parents=True)
    (settings.paths.raw_docs_dir / "legacy.md").write_text("# 校园卡\n挂失后补办。\n", encoding="utf-8")
    (settings.paths.index_dir / "chunks.json").write_text("[]", encoding="utf-8")
    (settings.paths.index_dir / "embeddings.npy").write_bytes(b"placeholder")
    store = KnowledgeBaseStore(settings)
    document = store.list_documents(DEFAULT_KNOWLEDGE_BASE_ID)[0]

    updated = store.delete_document(DEFAULT_KNOWLEDGE_BASE_ID, document.id)
    restarted = KnowledgeBaseStore(settings)

    assert updated.document_count == 0
    assert restarted.list_documents(DEFAULT_KNOWLEDGE_BASE_ID) == []
    assert not (restarted.raw_dir(DEFAULT_KNOWLEDGE_BASE_ID) / "legacy.md").exists()
    assert not (restarted.index_dir(DEFAULT_KNOWLEDGE_BASE_ID) / "chunks.json").exists()


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


def test_store_trains_boundary_classifier_model(tmp_path: Path) -> None:
    store = KnowledgeBaseStore(make_settings(tmp_path))
    knowledge_base = store.create_knowledge_base("边界样本库", "边界训练")

    for text, label in [
        ("校园卡丢了怎么办？", 1),
        ("校园卡补办需要哪些材料？", 1),
        ("推荐附近餐厅。", 0),
        ("讲一个睡前故事。", 0),
    ]:
        store.add_boundary_item(knowledge_base.id, text, label)

    job = store.create_classifier_job(
        knowledge_base.id,
        model_name="边界范围模型",
        model_alias="应用版",
    )

    assert job.status == "succeeded"
    assert (store.classifier_dir(knowledge_base.id) / "classifier.joblib").exists()
    models = store.list_classifier_models(knowledge_base.id)
    assert len(models) == 1
    assert models[0].name == "边界范围模型"
    assert models[0].status == "ready"
    assert store.get_knowledge_base(knowledge_base.id).active_classifier_model_id == models[0].id  # type: ignore[union-attr]
    assert store.settings_for(knowledge_base.id).paths.classifier_dir == Path(models[0].artifact_path).parent

    updated = store.set_active_classifier_model(knowledge_base.id, DISABLED_CLASSIFIER_MODEL_ID)

    assert updated.active_classifier_model_id == DISABLED_CLASSIFIER_MODEL_ID
    assert store.settings_for(knowledge_base.id).boundary_classifier.enabled is False


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
