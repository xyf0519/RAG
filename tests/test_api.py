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
    monkeypatch.setenv("AUTH_DEV_CODE", "123456")
    monkeypatch.setenv("ALLOWED_EMAIL_DOMAIN", "zju.edu.cn")
    monkeypatch.setenv("ADMIN_EMAILS", "admin@zju.edu.cn")


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


def test_email_auth_register_login_and_reset() -> None:
    with TestClient(app) as client:
        rejected = client.post("/api/v1/auth/register/start", json={"email": "user@example.com"})
        assert rejected.status_code == 400

        start = client.post("/api/v1/auth/register/start", json={"email": "user@zju.edu.cn"})
        assert start.status_code == 200

        wrong_code = client.post(
            "/api/v1/auth/register/verify",
            json={
                "email": "user@zju.edu.cn",
                "password": "password123",
                "code": "000000",
                "name": "求是用户",
            },
        )
        assert wrong_code.status_code == 400

        registered = client.post(
            "/api/v1/auth/register/verify",
            json={
                "email": "user@zju.edu.cn",
                "password": "password123",
                "code": "123456",
                "name": "求是用户",
            },
        )
        assert registered.status_code == 200
        assert registered.json()["user"]["role"] == "user"

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "user@zju.edu.cn", "password": "password123"},
        )
        assert login.status_code == 200
        assert login.json()["user"]["email"] == "user@zju.edu.cn"

        reset_start = client.post(
            "/api/v1/auth/password-reset/start",
            json={"email": "user@zju.edu.cn"},
        )
        assert reset_start.status_code == 200

        reset_confirm = client.post(
            "/api/v1/auth/password-reset/confirm",
            json={
                "email": "user@zju.edu.cn",
                "code": "123456",
                "password": "password456",
            },
        )
        assert reset_confirm.status_code == 200

        old_login = client.post(
            "/api/v1/auth/login",
            json={"email": "user@zju.edu.cn", "password": "password123"},
        )
        assert old_login.status_code == 401

        new_login = client.post(
            "/api/v1/auth/login",
            json={"email": "user@zju.edu.cn", "password": "password456"},
        )
        assert new_login.status_code == 200


def test_user_profile_update_saves_avatar_and_rejects_invalid_format() -> None:
    avatar = "data:image/png;base64,aGVsbG8="

    with TestClient(app) as client:
        assert client.post("/api/v1/auth/register/start", json={"email": "profile@zju.edu.cn"}).status_code == 200
        registered = client.post(
            "/api/v1/auth/register/verify",
            json={
                "email": "profile@zju.edu.cn",
                "password": "password123",
                "code": "123456",
                "name": "原昵称",
            },
        )
        assert registered.status_code == 200
        user = registered.json()["user"]

        update_response = client.patch(
            f"/api/v1/auth/users/{user['id']}/profile",
            json={"name": "新昵称", "avatar_url": avatar},
        )
        assert update_response.status_code == 200
        updated = update_response.json()["user"]
        assert updated["name"] == "新昵称"
        assert updated["avatar_url"] == avatar

        list_response = client.get("/api/v1/auth/users")
        assert list_response.status_code == 200
        listed = next(item for item in list_response.json()["users"] if item["id"] == user["id"])
        assert listed["name"] == "新昵称"
        assert listed["avatar_url"] == avatar

        invalid_response = client.patch(
            f"/api/v1/auth/users/{user['id']}/profile",
            json={"name": "新昵称", "avatar_url": "data:image/gif;base64,aGVsbG8="},
        )
        assert invalid_response.status_code == 400


def test_admin_email_gets_admin_role() -> None:
    with TestClient(app) as client:
        assert client.post("/api/v1/auth/register/start", json={"email": "admin@zju.edu.cn"}).status_code == 200
        response = client.post(
            "/api/v1/auth/register/verify",
            json={
                "email": "admin@zju.edu.cn",
                "password": "password123",
                "code": "123456",
                "name": "管理员",
            },
        )

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"


def test_multiple_allowed_email_domains(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOWED_EMAIL_DOMAINS", "zju.edu.cn, qq.com")

    with TestClient(app) as client:
        rejected = client.post("/api/v1/auth/register/start", json={"email": "user@example.com"})
        assert rejected.status_code == 400

        zju_start = client.post("/api/v1/auth/register/start", json={"email": "student@zju.edu.cn"})
        assert zju_start.status_code == 200

        qq_start = client.post("/api/v1/auth/register/start", json={"email": "3604405569@qq.com"})
        assert qq_start.status_code == 200


def test_admin_can_list_users_and_assign_roles() -> None:
    with TestClient(app) as client:
        assert client.post("/api/v1/auth/register/start", json={"email": "admin@zju.edu.cn"}).status_code == 200
        admin_response = client.post(
            "/api/v1/auth/register/verify",
            json={
                "email": "admin@zju.edu.cn",
                "password": "password123",
                "code": "123456",
                "name": "管理员",
            },
        )
        assert admin_response.status_code == 200
        admin = admin_response.json()["user"]

        assert client.post("/api/v1/auth/register/start", json={"email": "student@zju.edu.cn"}).status_code == 200
        user_response = client.post(
            "/api/v1/auth/register/verify",
            json={
                "email": "student@zju.edu.cn",
                "password": "password123",
                "code": "123456",
                "name": "学生用户",
            },
        )
        assert user_response.status_code == 200
        user = user_response.json()["user"]

        list_response = client.get("/api/v1/auth/users")
        assert list_response.status_code == 200
        listed = list_response.json()["users"]
        assert {item["email"] for item in listed} >= {"admin@zju.edu.cn", "student@zju.edu.cn"}
        assert next(item for item in listed if item["email"] == "admin@zju.edu.cn")["core_admin"] is True

        update_response = client.patch(
            f"/api/v1/auth/users/{user['id']}/role",
            params={"operator_user_id": admin["id"]},
            json={"role": "admin"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["user"]["role"] == "admin"

        core_downgrade = client.patch(
            f"/api/v1/auth/users/{admin['id']}/role",
            params={"operator_user_id": admin["id"]},
            json={"role": "user"},
        )
        assert core_downgrade.status_code == 400


def test_boundary_item_endpoints() -> None:
    with TestClient(app) as client:
        create_response = client.post(
            "/api/v1/knowledge-bases/kb-default/boundary-items",
            json={"text": "校园卡丢了怎么办？", "label": 1},
        )
        assert create_response.status_code == 200
        created = create_response.json()
        assert created["status"] == "approved"

        update_response = client.patch(
            f"/api/v1/knowledge-bases/kb-default/boundary-items/{created['id']}",
            json={"text": "请推荐附近餐厅。", "label": 0, "status": "approved"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["label"] == 0

        for text, label in [
            ("校园卡补办需要哪些材料？", 1),
            ("校园卡可以在哪些食堂使用？", 1),
            ("推荐附近餐厅。", 0),
            ("讲一个睡前故事。", 0),
        ]:
            sample_response = client.post(
                "/api/v1/knowledge-bases/kb-default/boundary-items",
                json={"text": text, "label": label},
            )
            assert sample_response.status_code == 200

        classifier_response = client.post(
            "/api/v1/knowledge-bases/kb-default/classifier-jobs",
            json={"model_name": "边界范围模型", "model_alias": "应用版"},
        )
        assert classifier_response.status_code == 200
        assert classifier_response.json()["status"] == "succeeded"

        model_response = client.get("/api/v1/knowledge-bases/kb-default/classifier-models")
        assert model_response.status_code == 200
        assert model_response.json()[0]["name"] == "边界范围模型"

        generate_response = client.post(
            "/api/v1/knowledge-bases/kb-default/boundary-items/generate",
            json={"count": 4, "label_hint": "校园卡"},
        )
        assert generate_response.status_code == 200
        generated = generate_response.json()
        assert len(generated) == 4
        assert {item["source"] for item in generated} == {"llm"}

        list_response = client.get("/api/v1/knowledge-bases/kb-default/boundary-items")
        assert list_response.status_code == 200
        assert len(list_response.json()) >= 5

        delete_response = client.delete(
            f"/api/v1/knowledge-bases/kb-default/boundary-items/{created['id']}",
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["ok"] is True


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
