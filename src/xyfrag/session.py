"""In-memory conversation session store."""

from __future__ import annotations

from collections import defaultdict
from threading import RLock

from xyfrag.schemas import ChatMessage


class InMemorySessionStore:
    """Thread-safe in-memory chat history store."""

    def __init__(self, max_messages: int = 20) -> None:
        """Initialize the session store.

        Args:
            max_messages: Maximum messages retained per session.

        Returns:
            None.
        """

        self._max_messages = max_messages
        self._lock = RLock()
        self._sessions: defaultdict[str, list[ChatMessage]] = defaultdict(list)

    def get_history(self, session_id: str) -> list[ChatMessage]:
        """Return chat history for a session.

        Args:
            session_id: Session identifier.

        Returns:
            A copy of the session message history.
        """

        with self._lock:
            return list(self._sessions[session_id])

    def append(self, session_id: str, role: str, content: str) -> None:
        """Append a message to a session.

        Args:
            session_id: Session identifier.
            role: Message role, either `user` or `assistant`.
            content: Message text.

        Returns:
            None.

        Raises:
            ValueError: If the role is unsupported.
        """

        if role not in {"user", "assistant"}:
            raise ValueError(f"Unsupported message role: {role}")

        with self._lock:
            self._sessions[session_id].append(
                ChatMessage(role=role, content=content)  # type: ignore[arg-type]
            )
            self._sessions[session_id] = self._sessions[session_id][
                -self._max_messages :
            ]

    def clear(self, session_id: str) -> None:
        """Clear one session.

        Args:
            session_id: Session identifier.

        Returns:
            None.
        """

        with self._lock:
            self._sessions.pop(session_id, None)
