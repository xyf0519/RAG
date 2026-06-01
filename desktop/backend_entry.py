"""Packaged desktop backend entrypoint for Maverella."""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import sys
from pathlib import Path


def bundle_root() -> Path:
    """Return the project/resource root used by the backend."""

    configured = os.getenv("XYFRAG_PROJECT_ROOT")
    if configured:
        return Path(configured).resolve()
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)).resolve()
    return Path(__file__).resolve().parents[1]


ROOT = bundle_root()
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
src_root = ROOT / "src"
if src_root.exists() and str(src_root) not in sys.path:
    sys.path.insert(0, str(src_root))

os.environ.setdefault("APP_MODE", "desktop")
os.environ.setdefault("XYFRAG_DESKTOP", "1")
os.environ.setdefault("XYFRAG_PROJECT_ROOT", str(ROOT))
os.environ.setdefault("XYFRAG_BOUNDARY_ENABLED", "0")
os.environ.setdefault("XYFRAG_RETRIEVAL_USE_LOCAL_MODELS", "0")


logger = logging.getLogger(__name__)


def default_user_root() -> Path:
    """Fallback data directory when Electron does not provide one."""

    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Maverella" / "rag-data"
    if sys.platform == "win32":
        return Path(os.getenv("APPDATA", Path.home() / "AppData" / "Roaming")) / "Maverella" / "rag-data"
    return Path.home() / ".local" / "share" / "Maverella" / "rag-data"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data-dir", default="")
    parser.add_argument("--models-dir", default="")
    parser.add_argument("--logs-dir", default="")
    return parser.parse_args()


def apply_path_env(args: argparse.Namespace) -> None:
    user_root = default_user_root()
    os.environ.setdefault("XYFRAG_DATA_DIR", args.data_dir or str(user_root / "data"))
    os.environ.setdefault("XYFRAG_MODELS_DIR", args.models_dir or str(user_root / "models"))
    os.environ.setdefault("XYFRAG_LOGS_DIR", args.logs_dir or str(user_root / "logs"))


def copy_directory_files_if_empty(source: Path, target: Path) -> None:
    if not source.exists():
        return
    target.mkdir(parents=True, exist_ok=True)
    if any(target.iterdir()):
        return
    for item in source.iterdir():
        destination = target / item.name
        if item.is_dir():
            shutil.copytree(item, destination, dirs_exist_ok=True)
        elif item.is_file():
            shutil.copy2(item, destination)


def ensure_default_workspace() -> None:
    from xyfrag.config import get_settings
    from xyfrag.knowledge_base import DEFAULT_KNOWLEDGE_BASE_ID, KnowledgeBaseStore
    from xyfrag.logging_config import configure_logging

    settings = get_settings()
    configure_logging(settings)
    copy_directory_files_if_empty(ROOT / "data" / "raw", settings.paths.raw_docs_dir)

    store = KnowledgeBaseStore(settings)
    knowledge_base = store.default_knowledge_base()
    if knowledge_base.index_status != "ready":
        job = store.create_index_job(DEFAULT_KNOWLEDGE_BASE_ID)
        if job.status != "succeeded":
            logger.warning("Default desktop index build failed during startup: %s", job.message)


def main() -> None:
    args = parse_args()
    apply_path_env(args)
    from app.main import apply_desktop_config

    apply_desktop_config()
    ensure_default_workspace()

    import uvicorn
    from app.main import app as fastapi_app

    uvicorn.run(
        fastapi_app,
        host=args.host,
        port=args.port,
        log_level="info",
        access_log=False,
    )


if __name__ == "__main__":
    main()
