"""FastAPI backend for Maverella."""

from __future__ import annotations

import logging
import json
import os
import re
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from typing import Annotated, Any, Literal, Optional, Union
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from xyfrag.auth_store import (
    AuthError,
    AuthStore,
    AuthUserRecord,
    admin_emails_from_env,
    allowed_domain_from_env,
    send_email_code,
)
from xyfrag.config import get_settings
from xyfrag.knowledge_base import (
    BoundaryDatasetItemRecord,
    ClassifierModelRecord,
    DEFAULT_KNOWLEDGE_BASE_ID,
    IndexJobRecord,
    KnowledgeBaseRecord,
    KnowledgeBaseStore,
    KnowledgeDocumentRecord,
)
from xyfrag.logging_config import configure_logging
from xyfrag.llm import LLMClientError, OpenAICompatibleClient
from xyfrag.service import RAGService
from xyfrag.session import InMemorySessionStore

logger = logging.getLogger(__name__)


def verify_internal_api_key(
    x_internal_api_key: Annotated[Optional[str], Header()] = None,
) -> None:
    expected = os.getenv("INTERNAL_API_KEY", "")
    if expected and x_internal_api_key != expected:
        raise HTTPException(status_code=401, detail="内部服务令牌无效。")


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


class ClassifierJobCreateRequest(BaseModel):
    model_name: str = Field(default="边界范围模型", min_length=1, max_length=120)
    model_scope: Literal["global", "knowledge_base", "session"] = "knowledge_base"
    model_alias: str = Field(default="应用版", min_length=1, max_length=64)


class ClassifierModelResponse(BaseModel):
    id: str
    knowledge_base_id: str
    name: str
    scope: str
    alias: str
    version: int
    status: str
    artifact_path: str
    metrics_json: str
    job_id: str
    created_at: float
    activated_at: Optional[float] = None


class BoundaryDatasetItemCreateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    label: int = Field(ge=0, le=1)


class BoundaryDatasetItemUpdateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    label: int = Field(ge=0, le=1)
    status: Optional[str] = None


class BoundaryDatasetGenerateRequest(BaseModel):
    count: int = Field(default=8, ge=1, le=30)
    label_hint: str = Field(default="", max_length=300)


class BoundaryDatasetItemResponse(BaseModel):
    id: str
    knowledge_base_id: str
    text: str
    label: int
    source: str
    status: str
    created_at: float


class AuthCodeRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class RegisterVerifyRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    code: str = Field(min_length=4, max_length=12)
    name: str = Field(default="", max_length=80)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class PasswordResetConfirmRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=4, max_length=12)
    password: str = Field(min_length=8, max_length=128)


class AuthUserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    email_verified_at: Optional[float] = None
    created_at: Optional[float] = None
    last_login_at: Optional[float] = None
    disabled_at: Optional[float] = None
    core_admin: bool = False


class AuthResponse(BaseModel):
    ok: bool
    user: Optional[AuthUserResponse] = None
    message: str = ""


class AuthUsersResponse(BaseModel):
    ok: bool
    users: list[AuthUserResponse]


class UserRoleUpdateRequest(BaseModel):
    role: Literal["user", "admin"]


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
    app.state.auth_store = AuthStore(
        settings.paths.ops_db,
        allowed_domain=allowed_domain_from_env(),
        admin_emails=admin_emails_from_env(),
    )
    app.state.rag_services = {}
    yield


app = FastAPI(title="Maverella", version="0.1.0", lifespan=lifespan)
InternalAuth = Annotated[None, Depends(verify_internal_api_key)]


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


@app.post("/api/v1/auth/register/start", response_model=AuthResponse)
async def auth_register_start(
    request: AuthCodeRequest,
    _internal: InternalAuth,
) -> AuthResponse:
    store: AuthStore = app.state.auth_store
    try:
        code = store.start_email_code(request.email, "register")
        send_email_code(store.normalize_email(request.email), code, "register")
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("stage=auth_register_start error=%s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail="验证码发送失败，请稍后重试。") from exc
    return AuthResponse(ok=True, message="验证码已发送。")


@app.post("/api/v1/auth/register/verify", response_model=AuthResponse)
async def auth_register_verify(
    request: RegisterVerifyRequest,
    _internal: InternalAuth,
) -> AuthResponse:
    store: AuthStore = app.state.auth_store
    try:
        user = store.register(
            email=request.email,
            password=request.password,
            code=request.code,
            name=request.name,
        )
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AuthResponse(ok=True, user=_auth_user_response(user), message="注册成功。")


@app.post("/api/v1/auth/login", response_model=AuthResponse)
async def auth_login(
    request: LoginRequest,
    _internal: InternalAuth,
) -> AuthResponse:
    store: AuthStore = app.state.auth_store
    try:
        user = store.login(request.email, request.password)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return AuthResponse(ok=True, user=_auth_user_response(user), message="登录成功。")


@app.get("/api/v1/auth/users/{user_id}", response_model=AuthResponse)
async def auth_get_user(user_id: str, _internal: InternalAuth) -> AuthResponse:
    store: AuthStore = app.state.auth_store
    try:
        user = store.require_user(user_id)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return AuthResponse(ok=True, user=_auth_user_response(user))


@app.get("/api/v1/auth/users", response_model=AuthUsersResponse)
async def auth_list_users(_internal: InternalAuth) -> AuthUsersResponse:
    store: AuthStore = app.state.auth_store
    return AuthUsersResponse(ok=True, users=[_auth_user_response(user, store) for user in store.list_users()])


@app.get("/api/v1/auth/admin/users", response_model=AuthUsersResponse)
async def auth_admin_list_users(_internal: InternalAuth) -> AuthUsersResponse:
    return await auth_list_users(_internal)


@app.patch("/api/v1/auth/users/{user_id}/role", response_model=AuthResponse)
async def auth_update_user_role(
    user_id: str,
    request: UserRoleUpdateRequest,
    operator_user_id: str,
    _internal: InternalAuth,
) -> AuthResponse:
    store: AuthStore = app.state.auth_store
    try:
        operator = store.require_user(operator_user_id)
        if operator.role != "admin":
            raise HTTPException(status_code=403, detail="需要管理员权限。")
        user = store.update_user_role(user_id, request.role, operator)
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AuthResponse(ok=True, user=_auth_user_response(user, store), message="权限已更新。")


@app.patch("/api/v1/auth/admin/users/{user_id}/role", response_model=AuthResponse)
async def auth_admin_update_user_role(
    user_id: str,
    request: UserRoleUpdateRequest,
    operator_user_id: str,
    _internal: InternalAuth,
) -> AuthResponse:
    return await auth_update_user_role(user_id, request, operator_user_id, _internal)


@app.post("/api/v1/auth/password-reset/start", response_model=AuthResponse)
async def auth_password_reset_start(
    request: AuthCodeRequest,
    _internal: InternalAuth,
) -> AuthResponse:
    store: AuthStore = app.state.auth_store
    try:
        code = store.start_email_code(request.email, "password_reset")
        send_email_code(store.normalize_email(request.email), code, "password_reset")
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("stage=auth_password_reset_start error=%s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail="验证码发送失败，请稍后重试。") from exc
    return AuthResponse(ok=True, message="验证码已发送。")


@app.post("/api/v1/auth/password-reset/confirm", response_model=AuthResponse)
async def auth_password_reset_confirm(
    request: PasswordResetConfirmRequest,
    _internal: InternalAuth,
) -> AuthResponse:
    store: AuthStore = app.state.auth_store
    try:
        user = store.reset_password(request.email, request.code, request.password)
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AuthResponse(ok=True, user=_auth_user_response(user), message="密码已更新。")


@app.post("/chat", response_model=Union[ChatResponse, ErrorResponse])
async def chat(
    request: ChatRequest,
    _internal: InternalAuth,
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
    _internal: InternalAuth,
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
async def list_knowledge_bases(_internal: InternalAuth) -> list[KnowledgeBaseResponse]:
    store: KnowledgeBaseStore = app.state.knowledge_store
    return [_kb_response(item) for item in store.list_knowledge_bases()]


@app.post("/api/v1/knowledge-bases", response_model=KnowledgeBaseResponse)
async def create_knowledge_base(
    request: KnowledgeBaseCreateRequest,
    _internal: InternalAuth,
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
    _internal: InternalAuth,
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
async def list_documents(
    knowledge_base_id: str,
    _internal: InternalAuth,
) -> list[KnowledgeDocumentResponse]:
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
    _internal: InternalAuth,
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


@app.delete(
    "/api/v1/knowledge-bases/{knowledge_base_id}/documents/{document_id}",
    response_model=KnowledgeBaseResponse,
)
async def delete_document(
    knowledge_base_id: str,
    document_id: str,
    _internal: InternalAuth,
) -> KnowledgeBaseResponse:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        knowledge_base = store.delete_document(knowledge_base_id, document_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="文档不存在。") from exc
    _invalidate_service(app, knowledge_base_id)
    return _kb_response(knowledge_base)


@app.post(
    "/api/v1/knowledge-bases/{knowledge_base_id}/index-jobs",
    response_model=IndexJobResponse,
)
async def create_index_job(
    knowledge_base_id: str,
    _internal: InternalAuth,
) -> IndexJobResponse:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        job = store.create_index_job(knowledge_base_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在。") from exc
    _invalidate_service(app, knowledge_base_id)
    return _job_response(job)


@app.get("/api/v1/jobs/{job_id}", response_model=IndexJobResponse)
async def get_job(job_id: str, _internal: InternalAuth) -> IndexJobResponse:
    store: KnowledgeBaseStore = app.state.knowledge_store
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在。")
    return _job_response(job)


@app.post(
    "/api/v1/knowledge-bases/{knowledge_base_id}/classifier-jobs",
    response_model=IndexJobResponse,
)
async def create_classifier_job(
    knowledge_base_id: str,
    _internal: InternalAuth,
    request: ClassifierJobCreateRequest = ClassifierJobCreateRequest(),
) -> IndexJobResponse:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        job = store.create_classifier_job(
            knowledge_base_id,
            model_name=request.model_name,
            model_scope=request.model_scope,
            model_alias=request.model_alias,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在。") from exc
    if job.status == "succeeded":
        _invalidate_service(app, knowledge_base_id)
    return _job_response(job)


@app.get(
    "/api/v1/knowledge-bases/{knowledge_base_id}/classifier-models",
    response_model=list[ClassifierModelResponse],
)
async def list_classifier_models(
    knowledge_base_id: str,
    _internal: InternalAuth,
) -> list[ClassifierModelResponse]:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        return [_classifier_model_response(item) for item in store.list_classifier_models(knowledge_base_id)]
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在。") from exc


@app.get(
    "/api/v1/knowledge-bases/{knowledge_base_id}/boundary-items",
    response_model=list[BoundaryDatasetItemResponse],
)
async def list_boundary_items(
    knowledge_base_id: str,
    _internal: InternalAuth,
) -> list[BoundaryDatasetItemResponse]:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        return [_boundary_item_response(item) for item in store.list_boundary_items(knowledge_base_id)]
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在。") from exc


@app.post(
    "/api/v1/knowledge-bases/{knowledge_base_id}/boundary-items",
    response_model=BoundaryDatasetItemResponse,
)
async def create_boundary_item(
    knowledge_base_id: str,
    request: BoundaryDatasetItemCreateRequest,
    _internal: InternalAuth,
) -> BoundaryDatasetItemResponse:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        item = store.add_boundary_item(
            knowledge_base_id,
            text=request.text,
            label=request.label,
            source="manual",
            status="approved",
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在。") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _boundary_item_response(item)


@app.patch(
    "/api/v1/knowledge-bases/{knowledge_base_id}/boundary-items/{item_id}",
    response_model=BoundaryDatasetItemResponse,
)
async def update_boundary_item(
    knowledge_base_id: str,
    item_id: str,
    request: BoundaryDatasetItemUpdateRequest,
    _internal: InternalAuth,
) -> BoundaryDatasetItemResponse:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        item = store.update_boundary_item(
            knowledge_base_id,
            item_id,
            text=request.text,
            label=request.label,
            status=request.status or "approved",
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="样本不存在。") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _boundary_item_response(item)


@app.delete(
    "/api/v1/knowledge-bases/{knowledge_base_id}/boundary-items/{item_id}",
    response_model=dict[str, bool],
)
async def delete_boundary_item(
    knowledge_base_id: str,
    item_id: str,
    _internal: InternalAuth,
) -> dict[str, bool]:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        store.delete_boundary_item(knowledge_base_id, item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="样本不存在。") from exc
    return {"ok": True}


@app.post(
    "/api/v1/knowledge-bases/{knowledge_base_id}/boundary-items/generate",
    response_model=list[BoundaryDatasetItemResponse],
)
async def generate_boundary_items(
    knowledge_base_id: str,
    request: BoundaryDatasetGenerateRequest,
    _internal: InternalAuth,
) -> list[BoundaryDatasetItemResponse]:
    store: KnowledgeBaseStore = app.state.knowledge_store
    try:
        knowledge_base = store.require_knowledge_base(knowledge_base_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="知识库不存在。") from exc

    knowledge_text = store.sample_knowledge_text(knowledge_base.id, limit=3600)
    samples = await _generate_boundary_sample_candidates(
        knowledge_base.name,
        knowledge_text,
        request.count,
        request.label_hint,
    )
    items = [
        store.add_boundary_item(
            knowledge_base.id,
            text=sample["text"],
            label=sample["label"],
            source="llm",
            status="draft",
        )
        for sample in samples
    ]
    return [_boundary_item_response(item) for item in items]


@app.delete("/sessions/{session_id}", response_model=dict[str, bool])
async def clear_session(session_id: str, _internal: InternalAuth) -> dict[str, bool]:
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


def _boundary_item_response(
    record: BoundaryDatasetItemRecord,
) -> BoundaryDatasetItemResponse:
    return BoundaryDatasetItemResponse(**record.__dict__)


def _classifier_model_response(record: ClassifierModelRecord) -> ClassifierModelResponse:
    return ClassifierModelResponse(**record.__dict__)


def _auth_user_response(record: AuthUserRecord, store: AuthStore | None = None) -> AuthUserResponse:
    return AuthUserResponse(
        id=record.id,
        name=record.name,
        email=record.email,
        role=record.role,
        email_verified_at=record.email_verified_at,
        created_at=record.created_at,
        last_login_at=record.last_login_at,
        disabled_at=record.disabled_at,
        core_admin=store.is_core_admin(record.email) if store else False,
    )


async def _generate_boundary_sample_candidates(
    knowledge_base_name: str,
    knowledge_text: str,
    count: int,
    label_hint: str,
) -> list[dict[str, int | str]]:
    settings = get_settings()
    prompt = f"""
请为知识库「{knowledge_base_name}」生成二分类边界训练样本。
数量：{count}
标签含义：1 表示知识库范围内，0 表示知识库范围外。
类别提示：{label_hint or "兼顾范围内与范围外问题"}
知识库摘要：
{knowledge_text[:3200] or "暂无资料摘要"}

只返回 JSON 数组。每项格式为 {{"text":"用户可能提出的问题","label":1}}。
""".strip()
    try:
        response = await OpenAICompatibleClient(settings.llm).chat(
            [
                {
                    "role": "system",
                    "content": "你是知识库边界训练样本生成助手，只输出 JSON。",
                },
                {"role": "user", "content": prompt},
            ]
        )
        parsed = _parse_boundary_samples(response.content, count)
        if parsed:
            return parsed
    except LLMClientError:
        pass

    return _fallback_boundary_samples(knowledge_base_name, count, label_hint, knowledge_text)


def _parse_boundary_samples(content: str, count: int) -> list[dict[str, int | str]]:
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\[[\s\S]*\]", content)
        if not match:
            return []
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return []
    if not isinstance(data, list):
        return []
    samples: list[dict[str, int | str]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text", "")).strip()
        label = item.get("label")
        if text and label in {0, 1}:
            samples.append({"text": text[:1000], "label": int(label)})
        if len(samples) >= count:
            break
    return samples


def _fallback_boundary_samples(
    knowledge_base_name: str,
    count: int,
    label_hint: str,
    knowledge_text: str,
) -> list[dict[str, int | str]]:
    positive_seed = [
        f"{knowledge_base_name}相关流程如何办理？",
        f"{knowledge_base_name}里的资料适用于哪些场景？",
        "资料中提到的申请条件是什么？",
        "如果相关证件遗失应该怎么处理？",
        "办理这项业务需要联系哪个部门？",
    ]
    negative_seed = [
        "帮我写一首诗。",
        "今天股票应该怎么买？",
        "推荐附近最好吃的餐厅。",
        "给我生成一段游戏剧情。",
        "解释一个和本知识库无关的娱乐新闻。",
    ]
    if label_hint:
        positive_seed.insert(0, f"{label_hint} 的范围内问题应该如何处理？")
        negative_seed.insert(0, f"请评价一款和 {label_hint} 无关的消费电子产品。")
    if knowledge_text:
        title = next(
            (line.lstrip("#").strip() for line in knowledge_text.splitlines() if line.strip().startswith("#")),
            knowledge_base_name,
        )
        positive_seed.insert(0, f"{title} 的核心规定是什么？")

    samples: list[dict[str, int | str]] = []
    for index in range(count):
        if index % 2 == 0:
            samples.append({"text": positive_seed[(index // 2) % len(positive_seed)], "label": 1})
        else:
            samples.append({"text": negative_seed[(index // 2) % len(negative_seed)], "label": 0})
    return samples
