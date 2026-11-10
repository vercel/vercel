from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import socket
    from collections.abc import Callable


def is_websocket_upgrade(headers: Any) -> bool:
    """Return True if the request headers describe a WebSocket upgrade.

    Mirrors the handshake checks used by WSGI WebSocket libraries such as
    flask-sock / simple-websocket: an ``Upgrade: websocket`` header together
    with an ``upgrade`` token in the ``Connection`` header.
    """
    upgrade = headers.get("upgrade")
    if not upgrade or upgrade.strip().lower() != "websocket":
        return False
    connection = headers.get("connection") or ""
    tokens = [token.strip().lower() for token in connection.split(",")]
    return "upgrade" in tokens


class UpgradeSocket:
    """Expose a WSGI connection socket to WebSocket libraries.

    WSGI (PEP 3333) has no concept of a WebSocket upgrade, so libraries such
    as simple-websocket (used by flask-sock) reach into the WSGI ``environ``
    to obtain the raw connection socket and write the ``101 Switching
    Protocols`` handshake to it directly, bypassing ``start_response``.

    This proxy exposes the underlying socket while watching outbound bytes for
    the ``101`` handshake. Once the handshake is written, ``on_upgrade`` is
    invoked exactly once so the runtime can end the request lifecycle and let
    the platform tunnel the connection bidirectionally, matching the ASGI
    ``websocket.accept`` behavior.
    """

    def __init__(
        self,
        sock: socket.socket,
        on_upgrade: Callable[[], None],
    ) -> None:
        self._sock = sock
        self._on_upgrade = on_upgrade
        self._upgraded = False

    def _maybe_signal_upgrade(self, data: Any) -> None:
        if self._upgraded:
            return
        # The handshake response starts with the HTTP status line, e.g.
        # b"HTTP/1.1 101 Switching Protocols\r\n". A non-101 response (e.g. a
        # rejected upgrade) is treated as a normal HTTP response, so the
        # request lifecycle ends through the usual path instead.
        prefix = bytes(data[:15]).upper()
        if prefix.startswith((b"HTTP/1.1 101", b"HTTP/1.0 101")):
            self._upgraded = True
            self._on_upgrade()

    def send(self, data: Any, *args: Any, **kwargs: Any) -> int:
        result = self._sock.send(data, *args, **kwargs)
        self._maybe_signal_upgrade(data)
        return result

    def sendall(self, data: Any, *args: Any, **kwargs: Any) -> None:
        self._sock.sendall(data, *args, **kwargs)
        self._maybe_signal_upgrade(data)

    def __getattr__(self, name: str) -> Any:
        # Delegate everything else (recv, fileno, close, setsockopt, ...) to
        # the wrapped socket so selectors and frame I/O work transparently.
        return getattr(self._sock, name)


def attach_wsgi_websocket(
    environ: dict[str, Any],
    headers: Any,
    sock: socket.socket,
    on_upgrade: Callable[[], None],
) -> bool:
    """Expose the raw connection socket for WSGI WebSocket upgrade requests.

    WSGI has no WebSocket support, so libraries like flask-sock /
    simple-websocket reach into the ``environ`` for the raw socket and write
    the ``101`` handshake to it directly. ``on_upgrade`` is invoked once that
    handshake is written so the platform can begin bidirectional streaming.

    Returns True if the request was a WebSocket upgrade (in which case the
    caller should stop reusing the connection), False otherwise.
    """
    if not is_websocket_upgrade(headers):
        return False
    ws_sock = UpgradeSocket(sock, on_upgrade)
    environ["werkzeug.socket"] = ws_sock
    environ["gunicorn.socket"] = ws_sock
    return True
