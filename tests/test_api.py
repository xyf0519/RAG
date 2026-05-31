from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.main as api
from app.main import app
from xyfrag.config import (
    AppConfig,
    BoundaryClassifierConfig,
    FrontendConfig,
    LLMConfig,
    PathConfig,
    RetrievalConfig,
    Settings,
)


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    raw_docs_dir = tmp_path / "legacy" / "raw"
    index_dir = tmp_path / "legacy" / "index"
    raw_docs_dir.mkdir(parents=True)
    (tmp_path / "logs").mkdir(parents=True)
    (raw_docs_dir / "campus.md").write_text(
        "# 校园卡\n校园卡丢失后应立即挂失并补办。\n",
        encoding="utf-8",
    )

    settings = Settings(
        app=AppConfig(),
        paths=PathConfig(
            raw_docs_dir=raw_docs_dir,
            index_dir=index_dir,
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

    monkeypatch.setattr(api, "get_settings", lambda: settings)


def test_health_endpoint() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_knowledge_base_management_endpoints() -> None:
    with TestClient(app) as client:
        create_response = client.post(
            "/api/v1/knowledge-bases",
            json={"name": "测试资料库", "description": "自动化测试"},
        )
        assert create_response.status_code == 200
        knowledge_base = create_response.json()

        list_response = client.get("/api/v1/knowledge-bases")
        assert list_response.status_code == 200
        assert any(item["id"] == knowledge_base["id"] for item in list_response.json())

        patch_response = client.patch(
            f"/api/v1/knowledge-bases/{knowledge_base['id']}",
            json={"status": "disabled"},
        )
        assert patch_response.status_code == 200
        assert patch_response.json()["status"] == "disabled"

        file_response = client.post(
            f"/api/v1/knowledge-bases/{knowledge_base['id']}/documents",
            files={"files": ("guide.md", b"# Guide\nCampus card replacement.\n", "text/markdown")},
        )
        assert file_response.status_code == 200
        assert file_response.json()[0]["filename"] == "guide.md"


def test_chat_unknown_knowledge_base_returns_404() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/chat/stream",
            json={
                "query": "校园卡丢了怎么办",
                "session_id": "test-missing-kb",
                "knowledge_base_id": "kb-missing",
            },
        )

    assert response.status_code == 404


def test_stream_endpoint_emits_ndjson() -> None:
    with TestClient(app) as client:
        job_response = client.post("/api/v1/knowledge-bases/kb-default/index-jobs")
        assert job_response.status_code == 200
        with client.stream(
            "POST",
            "/api/v1/chat/stream",
            json={"query": "校园卡丢了怎么办", "session_id": "test-api"},
        ) as response:
            body = "".join(response.iter_text())

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    assert '"type": "status"' in body or '"type":"status"' in body
    assert '"type": "final"' in body or '"type":"final"' in body
    assert "knowledge_base_id" in body
