"""Build the Maverella retrieval index from raw documents."""

from __future__ import annotations

import argparse
import logging

from xyfrag.config import get_settings
from xyfrag.index import build_index
from xyfrag.logging_config import configure_logging

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments.

    Args:
        None.

    Returns:
        Parsed arguments.
    """

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        default="config/settings.yaml",
        help="Path to settings YAML.",
    )
    return parser.parse_args()


def main() -> None:
    """Build and save the retrieval index.

    Args:
        None.

    Returns:
        None.
    """

    args = parse_args()
    settings = get_settings(args.config)
    configure_logging(settings)
    index = build_index(settings)
    index.save(settings.paths.index_dir)
    logger.info("Index build complete")


if __name__ == "__main__":
    main()
