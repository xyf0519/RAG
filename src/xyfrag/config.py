"""Configuration loading utilities for xyfRAG."""

from __future__ import annotations

from functools import lru_cache
import os
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(
    os.getenv("XYFRAG_PROJECT_ROOT") or Path(__file__).resolve().parents[2]
).resolve()


class AppConfig(BaseModel):
    """Application server settings."""

    name: str = "xyfRAG"
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"


class PathConfig(BaseModel):
    """Filesystem paths used by the project."""

    raw_docs_dir: Path = Path("data/raw")
    index_dir: Path = Path("data/index")
    classifier_dir: Path = Path("models/boundary_classifier")
    knowledge_bases_dir: Path = Path("data/knowledge_bases")
    knowledge_models_dir: Path = Path("models/knowledge_bases")
    ops_db: Path = Path("data/ops.sqlite3")
    log_file: Path = Path("logs/xyfrag.log")


class BoundaryClassifierConfig(BaseModel):
    """Boundary classifier inference settings."""

    enabled: bool = True
    threshold: float = 0.55


class RetrievalConfig(BaseModel):
    """Hybrid retrieval and reranking settings."""

    chunk_size: int = 420
    chunk_overlap: int = 80
    bm25_top_k: int = 8
    embedding_top_k: int = 8
    rerank_top_k: int = 3
    embedding_backend: str = "bge"
    embedding_model: str = "BAAI/bge-small-zh-v1.5"
    reranker_backend: str = "bge"
    reranker_model: str = "BAAI/bge-reranker-base"
    use_local_models: bool = True
    allow_model_fallback: bool = True


class LLMConfig(BaseModel):
    """OpenAI-compatible LLM settings."""

    provider: str = "openai_compatible"
    model: str = "deepseek-v4-flash"
    temperature: float = 0.2
    timeout_seconds: int = 30
    max_tokens: int = 900
    allow_mock_when_no_key: bool = True


class FrontendConfig(BaseModel):
    """Frontend integration settings."""

    backend_url: str = "http://127.0.0.1:8000"


class Settings(BaseModel):
    """Top-level project settings."""

    app: AppConfig = Field(default_factory=AppConfig)
    paths: PathConfig = Field(default_factory=PathConfig)
    boundary_classifier: BoundaryClassifierConfig = Field(
        default_factory=BoundaryClassifierConfig
    )
    retrieval: RetrievalConfig = Field(default_factory=RetrievalConfig)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    frontend: FrontendConfig = Field(default_factory=FrontendConfig)


def _read_yaml(path: Path) -> dict[str, Any]:
    """Read a YAML file as a dictionary.

    Args:
        path: YAML file path.

    Returns:
        Parsed YAML content.

    Raises:
        FileNotFoundError: If the config file does not exist.
        ValueError: If the YAML root is not a mapping.
    """

    if not path.exists():
        raise FileNotFoundError(f"Settings file not found: {path}")

    with path.open("r", encoding="utf-8") as file:
        data = yaml.safe_load(file) or {}

    if not isinstance(data, dict):
        raise ValueError(f"Settings YAML root must be a mapping: {path}")

    return data


def _project_path(path: Path) -> Path:
    """Resolve a path relative to the xyfRAG project root.

    Args:
        path: User configured path.

    Returns:
        Absolute path rooted at the project directory when needed.
    """

    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def _resolve_settings_paths(settings: Settings) -> Settings:
    """Resolve all filesystem paths in settings to project-rooted paths.

    Args:
        settings: Parsed settings object.

    Returns:
        Settings with absolute filesystem paths.
    """

    settings.paths.raw_docs_dir = _project_path(settings.paths.raw_docs_dir)
    settings.paths.index_dir = _project_path(settings.paths.index_dir)
    settings.paths.classifier_dir = _project_path(settings.paths.classifier_dir)
    settings.paths.knowledge_bases_dir = _project_path(settings.paths.knowledge_bases_dir)
    settings.paths.knowledge_models_dir = _project_path(settings.paths.knowledge_models_dir)
    settings.paths.ops_db = _project_path(settings.paths.ops_db)
    settings.paths.log_file = _project_path(settings.paths.log_file)
    return settings


def _apply_env_path_overrides(settings: Settings) -> Settings:
    """Apply desktop/deployment filesystem overrides before path resolution."""

    data_dir = os.getenv("XYFRAG_DATA_DIR")
    if data_dir:
        data_root = Path(data_dir)
        settings.paths.raw_docs_dir = data_root / "raw"
        settings.paths.index_dir = data_root / "index"
        settings.paths.knowledge_bases_dir = data_root / "knowledge_bases"
        settings.paths.ops_db = data_root / "ops.sqlite3"

    models_dir = os.getenv("XYFRAG_MODELS_DIR")
    if models_dir:
        models_root = Path(models_dir)
        settings.paths.classifier_dir = models_root / "boundary_classifier"
        settings.paths.knowledge_models_dir = models_root / "knowledge_bases"

    logs_dir = os.getenv("XYFRAG_LOGS_DIR")
    if logs_dir:
        settings.paths.log_file = Path(logs_dir) / "xyfrag.log"

    explicit_paths = {
        "XYFRAG_RAW_DOCS_DIR": "raw_docs_dir",
        "XYFRAG_INDEX_DIR": "index_dir",
        "XYFRAG_CLASSIFIER_DIR": "classifier_dir",
        "XYFRAG_KNOWLEDGE_BASES_DIR": "knowledge_bases_dir",
        "XYFRAG_KNOWLEDGE_MODELS_DIR": "knowledge_models_dir",
        "XYFRAG_OPS_DB": "ops_db",
        "XYFRAG_LOG_FILE": "log_file",
    }
    for env_name, field_name in explicit_paths.items():
        value = os.getenv(env_name)
        if value:
            setattr(settings.paths, field_name, Path(value))

    return settings


def _env_bool(value: str | None) -> bool | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return None


def _apply_env_runtime_overrides(settings: Settings) -> Settings:
    """Apply runtime feature toggles used by packaged desktop mode."""

    boundary_enabled = _env_bool(os.getenv("XYFRAG_BOUNDARY_ENABLED"))
    if boundary_enabled is not None:
        settings.boundary_classifier.enabled = boundary_enabled

    use_local_models = _env_bool(os.getenv("XYFRAG_RETRIEVAL_USE_LOCAL_MODELS"))
    if use_local_models is not None:
        settings.retrieval.use_local_models = use_local_models

    return settings


@lru_cache(maxsize=1)
def get_settings(config_path: str = "config/settings.yaml") -> Settings:
    """Load settings from YAML and environment variables.

    Args:
        config_path: Path to the YAML settings file.

    Returns:
        Validated application settings.

    Raises:
        FileNotFoundError: If the YAML settings file is missing.
        ValueError: If the settings file is malformed.
    """

    config_file = Path(config_path)
    if not config_file.is_absolute():
        config_file = PROJECT_ROOT / config_file

    load_dotenv(PROJECT_ROOT.parent / ".env")
    load_dotenv(PROJECT_ROOT / ".env", override=True)
    data = _read_yaml(config_file)
    settings = _resolve_settings_paths(
        _apply_env_runtime_overrides(
            _apply_env_path_overrides(Settings.model_validate(data))
        )
    )

    for path in (
        settings.paths.raw_docs_dir,
        settings.paths.index_dir,
        settings.paths.classifier_dir,
        settings.paths.knowledge_bases_dir,
        settings.paths.knowledge_models_dir,
        settings.paths.ops_db.parent,
        settings.paths.log_file.parent,
    ):
        path.mkdir(parents=True, exist_ok=True)

    return settings
