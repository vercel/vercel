from __future__ import annotations

import unittest
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    import socket

from vercel_runtime.wsgi_websocket import (
    UpgradeSocket,
    attach_wsgi_websocket,
    is_websocket_upgrade,
)

_HANDSHAKE_101 = b"HTTP/1.1 101 Switching Protocols\r\n\r\n"


class _FakeSocket:
    """Minimal socket stand-in recording outbound bytes."""

    def __init__(self) -> None:
        self.sent: list[bytes] = []
        self.closed = False

    def send(self, data: Any, *args: Any, **kwargs: Any) -> int:
        self.sent.append(bytes(data))
        return len(data)

    def sendall(self, data: Any, *args: Any, **kwargs: Any) -> None:
        self.sent.append(bytes(data))

    def recv(self, _size: int) -> bytes:
        return b"frame"

    def fileno(self) -> int:
        return 42

    def close(self) -> None:
        self.closed = True


def _as_socket(fake: _FakeSocket) -> socket.socket:
    return cast("socket.socket", fake)


class TestIsWebSocketUpgrade(unittest.TestCase):
    def test_detects_upgrade(self) -> None:
        self.assertTrue(
            is_websocket_upgrade(
                {"upgrade": "websocket", "connection": "Upgrade"}
            )
        )

    def test_detects_upgrade_with_multiple_connection_tokens(self) -> None:
        self.assertTrue(
            is_websocket_upgrade(
                {"upgrade": "WebSocket", "connection": "keep-alive, Upgrade"}
            )
        )

    def test_missing_connection_upgrade_token(self) -> None:
        self.assertFalse(
            is_websocket_upgrade(
                {"upgrade": "websocket", "connection": "keep-alive"}
            )
        )

    def test_missing_upgrade_header(self) -> None:
        self.assertFalse(is_websocket_upgrade({"connection": "Upgrade"}))

    def test_non_websocket_upgrade(self) -> None:
        self.assertFalse(
            is_websocket_upgrade({"upgrade": "h2c", "connection": "Upgrade"})
        )


class TestUpgradeSocket(unittest.TestCase):
    def test_fires_on_upgrade_once_when_101_written(self) -> None:
        fake = _FakeSocket()
        calls: list[int] = []
        sock = UpgradeSocket(_as_socket(fake), lambda: calls.append(1))

        sock.sendall(_HANDSHAKE_101)
        self.assertEqual(calls, [1])

        # A subsequent data frame must not re-fire the callback.
        sock.send(b"\x81\x05hello")
        self.assertEqual(calls, [1])

    def test_does_not_fire_on_non_101_response(self) -> None:
        fake = _FakeSocket()
        calls: list[int] = []
        sock = UpgradeSocket(_as_socket(fake), lambda: calls.append(1))

        sock.sendall(b"HTTP/1.1 400 Bad Request\r\n\r\n")
        self.assertEqual(calls, [])

    def test_does_not_signal_when_send_raises(self) -> None:
        class _BrokenSocket(_FakeSocket):
            def send(self, data: Any, *args: Any, **kwargs: Any) -> int:
                raise BrokenPipeError("write failed")

            def sendall(self, data: Any, *args: Any, **kwargs: Any) -> None:
                raise BrokenPipeError("write failed")

        broken = _BrokenSocket()
        calls: list[int] = []
        sock = UpgradeSocket(_as_socket(broken), lambda: calls.append(1))

        with self.assertRaises(BrokenPipeError):
            sock.send(_HANDSHAKE_101)
        with self.assertRaises(BrokenPipeError):
            sock.sendall(_HANDSHAKE_101)

        # The upgrade must not be signaled if the handshake write failed.
        self.assertEqual(calls, [])

    def test_send_passes_through_and_returns_underlying_value(self) -> None:
        fake = _FakeSocket()
        sock = UpgradeSocket(_as_socket(fake), lambda: None)

        result = sock.send(b"abc")
        self.assertEqual(result, 3)
        self.assertEqual(fake.sent, [b"abc"])

    def test_delegates_unknown_attributes_to_wrapped_socket(self) -> None:
        fake = _FakeSocket()
        sock = UpgradeSocket(_as_socket(fake), lambda: None)

        self.assertEqual(sock.recv(10), b"frame")
        self.assertEqual(sock.fileno(), 42)
        sock.close()
        self.assertTrue(fake.closed)


class TestAttachWsgiWebSocket(unittest.TestCase):
    def test_returns_false_and_leaves_environ_untouched(self) -> None:
        fake = _FakeSocket()
        environ: dict[str, Any] = {}

        attached = attach_wsgi_websocket(
            environ, {"host": "example.com"}, _as_socket(fake), lambda: None
        )

        self.assertFalse(attached)
        self.assertEqual(environ, {})

    def test_exposes_socket_for_upgrade_requests(self) -> None:
        fake = _FakeSocket()
        environ: dict[str, Any] = {}
        calls: list[int] = []

        attached = attach_wsgi_websocket(
            environ,
            {"upgrade": "websocket", "connection": "Upgrade"},
            _as_socket(fake),
            lambda: calls.append(1),
        )

        self.assertTrue(attached)
        self.assertIsInstance(environ["werkzeug.socket"], UpgradeSocket)
        self.assertIs(environ["gunicorn.socket"], environ["werkzeug.socket"])

        # Writing the handshake through the exposed socket ends the request.
        environ["werkzeug.socket"].sendall(_HANDSHAKE_101)
        self.assertEqual(calls, [1])


if __name__ == "__main__":
    unittest.main(verbosity=2)
