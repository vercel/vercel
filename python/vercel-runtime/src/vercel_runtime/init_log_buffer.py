from __future__ import annotations

import base64
import contextlib
import json
import threading
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable

type _IpcMessage = dict[str, Any]

_MAX_BYTES = 1_000_000


class InitLogBuffer:
    """Hold log messages until ``server-started`` is sent.

    The functions runtime accepts ``log`` messages only after
    ``server-started``, so messages logged before it are buffered and sent by
    ``flush_to_ipc``. If the process exits first, ``flush_to_stderr`` writes
    them to stderr instead.
    """

    def __init__(
        self,
        send_message: Callable[[_IpcMessage], None],
        write_stderr: Callable[[str], None],
    ) -> None:
        self._send_message = send_message
        self._write_stderr = write_stderr
        self._messages: list[_IpcMessage] = []
        self._size = 0
        # Set as the flush begins, while the flushing thread holds the lock.
        self._flush_started = False
        self._ready = False
        # Application threads may log while the buffer is flushed. Reentrant so
        # a signal handler that logs mid-flush cannot deadlock.
        self._lock = threading.RLock()

    def reinit_lock_after_fork(self) -> None:
        """Replace the lock in a forked child, as its holder may not exist."""
        self._lock = threading.RLock()

    def enqueue_or_send(self, message: _IpcMessage) -> None:
        if self._ready:
            self._send_message(message)
            return

        with self._lock:
            # Either the buffer was flushed while this thread waited, or this is
            # a signal handler logging mid-flush, where a buffered message could
            # be cleared without being sent.
            if self._ready or self._flush_started:
                self._send_message(message)
                return

            size = len(json.dumps(message))
            if self._size + size <= _MAX_BYTES:
                self._messages.append(message)
                self._size += size
            else:
                # Fallback so the message is not lost if the buffer is full
                with contextlib.suppress(Exception):
                    self._write_stderr(_decode_log_text(message))

    def flush_to_ipc(self) -> None:
        """Send the buffered messages, and later ones directly."""
        with self._lock:
            self._flush_started = True
            for message in self._messages:
                self._send_message(message)
            self._clear()
            # Set last so that no other thread can overtake the buffered
            # messages.
            self._ready = True

    def flush_to_stderr(self) -> None:
        with self._lock:
            texts: list[str] = []
            for message in self._messages:
                with contextlib.suppress(Exception):
                    texts.append(_decode_log_text(message))
            self._clear()
            text = "".join(texts)
            if text:
                self._write_stderr(text)

    def _clear(self) -> None:
        self._messages.clear()
        self._size = 0


def _decode_log_text(message: _IpcMessage) -> str:
    payload = message.get("payload", {})
    encoded = payload.get("message", "")
    return base64.b64decode(encoded).decode(errors="ignore")
