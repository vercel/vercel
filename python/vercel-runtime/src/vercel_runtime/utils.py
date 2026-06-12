from __future__ import annotations

import ast
import runpy
from typing import Protocol

# Matches the platform request body limit.
_MAX_CHUNKED_BODY_BYTES = 100 * 1024 * 1024
_MAX_CHUNK_SIZE_LINE = 65536
_MAX_TRAILER_BYTES = 8 * 1024


def _is_main_guard_test(node: ast.AST) -> bool:
    if not isinstance(node, ast.Compare):
        return False
    if len(node.ops) != 1 or not isinstance(node.ops[0], ast.Eq):
        return False
    if len(node.comparators) != 1:
        return False

    left = node.left
    right = node.comparators[0]

    left_is_name = isinstance(left, ast.Name) and left.id == "__name__"
    right_is_main = (
        isinstance(right, ast.Constant)
        and isinstance(right.value, str)
        and right.value == "__main__"
    )
    if left_is_name and right_is_main:
        return True

    right_is_name = isinstance(right, ast.Name) and right.id == "__name__"
    left_is_main = (
        isinstance(left, ast.Constant)
        and isinstance(left.value, str)
        and left.value == "__main__"
    )
    return right_is_name and left_is_main


def has_main_guard(entrypoint_abs: str | None) -> bool:
    if not entrypoint_abs:
        return False

    try:
        with open(entrypoint_abs, encoding="utf-8") as file:
            source = file.read()
    except Exception:
        return False

    try:
        tree = ast.parse(source, filename=entrypoint_abs)
    except Exception:
        return False

    for node in ast.walk(tree):
        if isinstance(node, ast.If) and _is_main_guard_test(node.test):
            return True
    return False


def run_entrypoint_as_main(entrypoint_abs: str) -> None:
    runpy.run_path(entrypoint_abs, run_name="__main__")


class _Readable(Protocol):
    def read(self, size: int = ..., /) -> bytes: ...
    def readline(self, size: int = ..., /) -> bytes: ...


class _HeaderLookup(Protocol):
    def get(self, key: str, /) -> str | None: ...


def _get_header(headers: _HeaderLookup, name: str) -> str | None:
    # http.server headers are case-insensitive; a plain dict is not.
    value = headers.get(name)
    if value is not None:
        return value
    return headers.get(name.lower())


def read_wsgi_request_body(
    rfile: _Readable,
    headers: _HeaderLookup,
    max_bytes: int = _MAX_CHUNKED_BODY_BYTES,
) -> bytes:
    """Read a WSGI request body.

    WSGI has no portable chunked-input support (PEP 3333), so a
    ``Transfer-Encoding: chunked`` request must be de-chunked here.
    """
    content_length_raw = _get_header(headers, "Content-Length")
    transfer_encoding = _get_header(headers, "Transfer-Encoding") or ""
    has_chunked = "chunked" in transfer_encoding.lower()

    # RFC 9112 §6.3: a message with both framing headers may be a request
    # smuggling attempt and must be rejected.
    if content_length_raw is not None and has_chunked:
        raise ValueError(
            "request has both Content-Length and Transfer-Encoding: chunked"
        )

    if content_length_raw is not None:
        try:
            content_length = int(content_length_raw)
        except ValueError as exc:
            raise ValueError(
                f"invalid Content-Length: {content_length_raw!r}"
            ) from exc
        if content_length < 0:
            raise ValueError(f"invalid Content-Length: {content_length_raw!r}")
        if content_length == 0:
            return b""
        return rfile.read(content_length)

    if has_chunked:
        return _read_chunked_body(rfile, max_bytes)

    return b""


def _read_chunked_body(rfile: _Readable, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        size_line = rfile.readline(_MAX_CHUNK_SIZE_LINE)
        if not size_line:
            raise ValueError(
                "could not read chunk size: unexpected end of stream"
            )
        size_token = size_line.split(b";", 1)[0].strip()
        try:
            chunk_size = int(size_token, 16)
        except ValueError as exc:
            raise ValueError(f"invalid chunk size: {size_token!r}") from exc
        if chunk_size == 0:
            # Drain trailer headers up to the terminating blank line. Bounded
            # so a hostile peer cannot pin the connection with endless lines.
            trailer_total = 0
            while True:
                trailer = rfile.readline(_MAX_CHUNK_SIZE_LINE)
                if trailer in (b"\r\n", b"\n", b""):
                    break
                trailer_total += len(trailer)
                if trailer_total > _MAX_TRAILER_BYTES:
                    raise ValueError(
                        "chunked request trailer exceeds maximum size"
                    )
            break
        total += chunk_size
        if total > max_bytes:
            raise ValueError("chunked request body exceeds maximum size")
        data = rfile.read(chunk_size)
        if len(data) != chunk_size:
            raise ValueError(
                "could not read full chunk: unexpected end of stream"
            )
        chunks.append(data)
        rfile.readline(_MAX_CHUNK_SIZE_LINE)
    return b"".join(chunks)
