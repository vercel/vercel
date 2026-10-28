from __future__ import annotations

import base64
import threading
import unittest
from typing import TYPE_CHECKING, Any

from vercel_runtime import init_log_buffer

if TYPE_CHECKING:
    from collections.abc import Callable


def _log(text: str) -> dict[str, Any]:
    return {
        "type": "log",
        "payload": {"message": base64.b64encode(text.encode()).decode()},
    }


def _text(message: dict[str, Any]) -> str:
    return base64.b64decode(message["payload"]["message"]).decode()


class TestInitLogBuffer(unittest.TestCase):
    def setUp(self) -> None:
        self.sent: list[dict[str, Any]] = []
        self.stderr: list[str] = []
        # Runs after each message is sent, while a flush is in progress.
        self.after_send: Callable[[str], None] | None = None
        self.buffer = init_log_buffer.InitLogBuffer(
            self._send, self.stderr.append
        )

    def _send(self, message: dict[str, Any]) -> None:
        self.sent.append(message)
        if self.after_send is not None:
            self.after_send(_text(message))

    def _sent_texts(self) -> list[str]:
        return [_text(m) for m in self.sent]

    def _assert_returns(self, func: Callable[[], object]) -> None:
        thread = threading.Thread(target=func, daemon=True)
        thread.start()
        thread.join(timeout=5.0)
        self.assertFalse(thread.is_alive(), "call did not return")

    def test_buffers_until_flushed(self) -> None:
        self.buffer.enqueue_or_send(_log("a"))
        self.buffer.enqueue_or_send(_log("b"))
        self.assertEqual(self.sent, [])

        self.buffer.flush_to_ipc()
        self.buffer.enqueue_or_send(_log("c"))

        self.assertEqual(self._sent_texts(), ["a", "b", "c"])

    def test_other_thread_cannot_overtake_buffered_messages(self) -> None:
        self.buffer.enqueue_or_send(_log("a"))
        self.buffer.enqueue_or_send(_log("b"))
        late = threading.Thread(
            target=self.buffer.enqueue_or_send, args=(_log("late"),)
        )

        def start_late_thread(text: str) -> None:
            if text == "a":
                late.start()
                # The flush holds the lock, so the thread has to wait for it.
                late.join(timeout=0.1)
                self.assertTrue(late.is_alive())

        self.after_send = start_late_thread
        self.buffer.flush_to_ipc()
        late.join(timeout=5.0)

        self.assertEqual(self._sent_texts(), ["a", "b", "late"])

    def test_signal_handler_logging_mid_flush_does_not_deadlock(self) -> None:
        self.buffer.enqueue_or_send(_log("a"))
        self.buffer.enqueue_or_send(_log("b"))

        def log_from_flushing_thread(text: str) -> None:
            # As a signal handler would, on the thread that holds the lock.
            if text == "a":
                self.buffer.enqueue_or_send(_log("handler"))

        self.after_send = log_from_flushing_thread
        self._assert_returns(self.buffer.flush_to_ipc)

        self.assertEqual(self._sent_texts(), ["a", "handler", "b"])
        self.buffer.flush_to_stderr()
        self.assertEqual(self.stderr, [])

    def test_full_buffer_writes_to_stderr(self) -> None:
        large = "x" * init_log_buffer._MAX_BYTES
        self.buffer.enqueue_or_send(_log(large))
        self.assertEqual(self.stderr, [large])

        self.buffer.flush_to_ipc()
        self.assertEqual(self.sent, [])

    def test_flush_to_stderr_writes_buffered_text(self) -> None:
        self.buffer.enqueue_or_send(_log("a\n"))
        self.buffer.enqueue_or_send(_log("b\n"))

        self.buffer.flush_to_stderr()
        self.buffer.flush_to_ipc()

        self.assertEqual(self.stderr, ["a\nb\n"])
        self.assertEqual(self.sent, [])

    def test_flush_to_stderr_skips_empty_buffer(self) -> None:
        self.buffer.flush_to_stderr()

        self.assertEqual(self.stderr, [])

    def test_reinit_lock_after_fork_replaces_held_lock(self) -> None:
        # A thread that exits holding the lock leaves it held, like a lock
        # inherited across fork().
        holder = threading.Thread(target=self.buffer._lock.acquire)
        holder.start()
        holder.join()

        self.buffer.reinit_lock_after_fork()
        self._assert_returns(lambda: self.buffer.enqueue_or_send(_log("a")))
        self.buffer.flush_to_ipc()

        self.assertEqual(self._sent_texts(), ["a"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
