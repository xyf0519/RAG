"""Configuration loading utilities for xyfRAG."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field


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
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    reranker_model: str = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"
    use_local_models: bool = False


class LLMConfig(BaseModel):
    """OpenAI-compatible LLM settings."""

    provider: str = "openai_compatible"
    model: str = "gpt-4.1-mini"
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

    load_dotenv()
    data = _read_yaml(Path(config_path))
    settings = Settings.model_validate(data)

    for path in (
        settings.paths.raw_docs_dir,
        settings.paths.index_dir,
        settings.paths.classifier_dir,
        settings.paths.log_file.parent,
    ):
        path.mkdir(parents=True, exist_ok=True)

    return settings
