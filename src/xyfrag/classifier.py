"""Boundary classifier inference for filtering out-of-scope queries."""

from __future__ import annotations

import logging
from importlib import import_module
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from xyfrag.config import BoundaryClassifierConfig

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BoundaryDecision:
    """Boundary classifier output."""

    is_in_scope: bool
    probability: float
    reason: str


class BoundaryClassifier:
    """Load and run the boundary classifier artifact."""

    def __init__(self, model_dir: Path, config: BoundaryClassifierConfig) -> None:
        """Initialize the classifier.

        Args:
            model_dir: Directory containing the trained classifier artifact.
            config: Boundary classifier configuration.

        Returns:
            None.
        """

        self._model_path = model_dir / "classifier.joblib"
        self._config = config
        self._pipeline: Optional[Any] = None
        self._load()

    def _load(self) -> None:
        """Load the joblib pipeline if it exists.

        Args:
            None.

        Returns:
            None.
        """

        if not self._config.enabled:
            logger.info("Boundary classifier disabled by configuration")
            return

        if not self._model_path.exists():
            logger.error("Boundary classifier model missing: %s", self._model_path)
            return

        try:
            joblib = import_module("joblib")
        except ModuleNotFoundError as exc:
            logger.error("joblib is required to load the boundary classifier: %s", exc)
            return

        self._pipeline = joblib.load(self._model_path)
        logger.info("Boundary classifier loaded from %s", self._model_path)

    def decide(self, query: str) -> BoundaryDecision:
        """Classify whether a user query belongs to the knowledge base scope.

        Args:
            query: User question.

        Returns:
            Boundary decision including label and confidence.
        """

        if not self._config.enabled:
            return BoundaryDecision(
                is_in_scope=True,
                probability=1.0,
                reason="classifier_disabled",
            )

        if self._pipeline is None:
            logger.error("Boundary classifier unavailable; defaulting to in-scope")
            return BoundaryDecision(
                is_in_scope=True,
                probability=1.0,
                reason="classifier_unavailable",
            )

        probabilities = self._pipeline.predict_proba([query])[0]
        classes = list(self._pipeline.classes_)
        label_one_index = classes.index(1)
        in_scope_probability = float(probabilities[label_one_index])
        is_in_scope = in_scope_probability >= self._config.threshold

        return BoundaryDecision(
            is_in_scope=is_in_scope,
            probability=in_scope_probability,
            reason="classified",
        )
