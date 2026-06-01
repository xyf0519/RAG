"""Logging configuration for Maverella."""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

from xyfrag.config import Settings


def configure_logging(settings: Settings) -> None:
    """Configure console and rotating file logging.

    Args:
        settings: Application settings.

    Returns:
        None.
    """

    level = getattr(logging, settings.app.log_level.upper(), logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(level)

    file_handler = RotatingFileHandler(
        settings.paths.log_file,
        maxBytes=5_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(level)

    root.addHandler(console_handler)
    root.addHandler(file_handler)
