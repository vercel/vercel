from __future__ import annotations

import base64
import hashlib
import struct

# Mirrors how simple-websocket (the engine behind flask-sock) drives a
# WebSocket connection in "werkzeug" mode: it pulls the raw connection socket
# out of the WSGI environ, writes the 101 handshake to it directly (bypassing
# start_response), and then reads/writes frames on that socket. This fixture
# reimplements that flow without external dependencies so the test suite can
# exercise the runtime's environ socket exposure.

_WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def _accept_key(key: str) -> str:
    digest = hashlib.sha1((key + _WS_MAGIC).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


def _recv_exact(sock, count):
    buf = b""
    while len(buf) < count:
        chunk = sock.recv(count - len(buf))
        if not chunk:
            raise ConnectionError("socket closed during frame read")
        buf += chunk
    return buf


def _read_frame(sock):
    first, second = _recv_exact(sock, 2)
    opcode = first & 0x0F
    length = second & 0x7F
    has_mask = bool(second & 0x80)

    if length == 126:
        length = struct.unpack("!H", _recv_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _recv_exact(sock, 8))[0]

    mask = _recv_exact(sock, 4) if has_mask else b""
    payload = _recv_exact(sock, length) if length else b""
    if has_mask:
        payload = bytes(
            byte ^ mask[index % 4] for index, byte in enumerate(payload)
        )
    return opcode, payload


def _write_frame(sock, opcode, payload=b""):
    frame = bytearray([0x80 | opcode])
    length = len(payload)
    if length < 126:
        frame.append(length)
    elif length < 1 << 16:
        frame.append(126)
        frame.extend(struct.pack("!H", length))
    else:
        frame.append(127)
        frame.extend(struct.pack("!Q", length))
    frame.extend(payload)
    sock.sendall(bytes(frame))


def _handshake(sock, key):
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {_accept_key(key)}\r\n"
        "\r\n"
    )
    sock.sendall(response.encode("ascii"))


def app(environ, start_response):
    is_upgrade = environ.get("HTTP_UPGRADE", "").lower() == "websocket"
    if not is_upgrade:
        # A normal HTTP request must still work through the regular WSGI path.
        body = b"not a websocket"
        start_response(
            "200 OK",
            [
                ("Content-Type", "text/plain"),
                ("Content-Length", str(len(body))),
            ],
        )
        return [body]

    sock = environ.get("werkzeug.socket")
    if sock is None:
        body = b"no socket in environ"
        start_response(
            "500 Internal Server Error",
            [
                ("Content-Type", "text/plain"),
                ("Content-Length", str(len(body))),
            ],
        )
        return [body]

    key = environ["HTTP_SEC_WEBSOCKET_KEY"]
    _handshake(sock, key)

    # Echo text frames back with an "echo:" prefix until the peer closes.
    while True:
        try:
            opcode, payload = _read_frame(sock)
        except (ConnectionError, OSError):
            break
        if opcode == 0x8:  # close
            _write_frame(sock, 0x8, struct.pack("!H", 1000))
            break
        if opcode == 0x1:  # text
            text = payload.decode("utf-8")
            _write_frame(sock, 0x1, f"echo:{text}".encode())

    return []
