"""N1 IPC mock server."""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any, Literal, TypeVar

import attrs

if TYPE_CHECKING:
    import pathlib
    from collections.abc import AsyncIterator


@attrs.frozen
class Context:
    """Per-request context attached to most IPC messages."""

    invocation_id: str = attrs.field(default="0")
    request_id: int | None = attrs.field(default=None)


@attrs.frozen
class ServerStartedPayload:
    """Payload for ``server-started``."""

    init_duration: int
    http_port: int


@attrs.frozen
class HandlerStartedPayload:
    """Payload for ``handler-started``."""

    context: Context
    handler_started_at: int


@attrs.frozen
class LogPayload:
    """Payload for ``log``."""

    context: Context
    message: str
    level: str | None = attrs.field(default=None)
    stream: Literal["stdout", "stderr"] | None = attrs.field(default=None)


@attrs.frozen
class EndPayload:
    """Payload for ``end``."""

    context: Context
    error: str | None = attrs.field(default=None)


@attrs.frozen
class MetricPayload:
    """Payload for ``metric``."""

    context: Context
    type: str
    payload: dict[str, Any] = attrs.Factory(dict[str, Any])


# ------------------------------------------------------------------
# Typed N1 messages
# ------------------------------------------------------------------


@attrs.frozen
class ServerStartedMessage:
    """``server-started`` message."""

    type: Literal["server-started"]
    payload: ServerStartedPayload


@attrs.frozen
class HandlerStartedMessage:
    """``handler-started`` message."""

    type: Literal["handler-started"]
    payload: HandlerStartedPayload


@attrs.frozen
class LogMessage:
    """``log`` message."""

    type: Literal["log"]
    payload: LogPayload


@attrs.frozen
class EndMessage:
    """``end`` message."""

    type: Literal["end"]
    payload: EndPayload


@attrs.frozen
class MetricMessage:
    """``metric`` message."""

    type: Literal["metric"]
    payload: MetricPayload


@attrs.frozen
class UnknownMessage:
    """Fallback for unrecognised message types."""

    type: str
    payload: dict[str, Any] = attrs.Factory(dict[str, Any])


def _parse_context(raw: dict[str, Any]) -> Context:
    return Context(
        invocation_id=raw.get("invocationId", "0"),
        request_id=raw.get("requestId"),
    )


def _parse_message(raw: dict[str, Any]) -> N1Message:
    """Parse a raw JSON dict into a typed N1 message."""
    msg_type = raw.get("type", "")
    payload = raw.get("payload", {})

    if msg_type == "server-started":
        return ServerStartedMessage(
            type="server-started",
            payload=ServerStartedPayload(
                init_duration=payload["initDuration"],
                http_port=payload["httpPort"],
            ),
        )

    if msg_type == "handler-started":
        return HandlerStartedMessage(
            type="handler-started",
            payload=HandlerStartedPayload(
                context=_parse_context(payload.get("context", {})),
                handler_started_at=payload["handlerStartedAt"],
            ),
        )

    if msg_type == "log":
        return LogMessage(
            type="log",
            payload=LogPayload(
                context=_parse_context(payload.get("context", {})),
                message=payload.get("message", ""),
                level=payload.get("level"),
                stream=payload.get("stream"),
            ),
        )

    if msg_type == "end":
        return EndMessage(
            type="end",
            payload=EndPayload(
                context=_parse_context(payload.get("context", {})),
                error=payload.get("error"),
            ),
        )

    if msg_type == "metric":
        return MetricMessage(
            type="metric",
            payload=MetricPayload(
                context=_parse_context(payload.get("context", {})),
                type=payload.get("type", ""),
                payload=payload.get("payload", {}),
            ),
        )

    return UnknownMessage(type=msg_type, payload=payload)


N1Message = (
    ServerStartedMessage
    | HandlerStartedMessage
    | LogMessage
    | EndMessage
    | MetricMessage
    | UnknownMessage
)

_M = TypeVar("_M", bound=N1Message)


class N1Connection:
    """Reads/parses N1 IPC messages from a connection."""

    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        self._reader = reader
        self._writer = writer
        self._buf = b""

    async def read_messages(self) -> list[N1Message]:
        """Read available data and return complete messages."""
        data = await self._reader.read(65536)
        if not data:
            return []

        self._buf += data
        messages: list[N1Message] = []

        while b"\0" in self._buf:
            raw, self._buf = self._buf.split(b"\0", 1)
            if not raw:
                continue
            messages.append(_parse_message(json.loads(raw)))

        return messages

    @property
    def at_eof(self) -> bool:
        """Whether the underlying reader has reached EOF."""
        return self._reader.at_eof()

    def close(self) -> None:
        """Close the writer side of the connection."""
        self._writer.close()


@attrs.define
class N1Mock:
    """Mock N1 IPC server that collects messages from the runtime."""

    socket_path: str
    server: asyncio.Server = attrs.field(init=False)
    queue: asyncio.Queue[N1Message | None] = attrs.Factory(
        asyncio.Queue[N1Message | None]
    )
    _connected: asyncio.Event = attrs.Factory(asyncio.Event)
    _connection: N1Connection | None = attrs.field(default=None)

    async def _handle_client(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        self._connection = N1Connection(reader, writer)
        self._connected.set()

        try:
            while not self._connection.at_eof:
                messages = await self._connection.read_messages()
                if not messages:
                    break
                for msg in messages:
                    await self.queue.put(msg)
        finally:
            await self.queue.put(None)

    async def wait_for_connection(self, timeout: float = 10.0) -> None:
        """Wait for the runtime subprocess to connect."""
        async with asyncio.timeout(timeout):
            await self._connected.wait()

    async def receive_messages(
        self,
    ) -> AsyncIterator[N1Message]:
        """Async iterator over received messages.

        Stops on connection close.
        """
        while True:
            msg = await self.queue.get()
            if msg is None:
                break
            yield msg

    async def wait_for_message(
        self,
        msg_type: type[_M],
        timeout: float = 10.0,
    ) -> _M:
        """Wait for a message of the given class.

        Non-matching messages are re-queued.
        """
        stash: list[N1Message | None] = []

        try:
            async with asyncio.timeout(timeout):
                while True:
                    msg = await self.queue.get()
                    if msg is None:
                        stash.append(msg)
                        raise ConnectionError(
                            f"Connection closed while waiting for {msg_type!r}"
                        )
                    if isinstance(msg, msg_type):
                        return msg
                    stash.append(msg)
        finally:
            for m in stash:
                await self.queue.put(m)

    async def collect_messages(
        self,
        timeout: float = 5.0,
    ) -> list[N1Message]:
        """Collect messages until close or timeout."""
        messages: list[N1Message] = []
        try:
            async with asyncio.timeout(timeout):
                async for msg in self.receive_messages():
                    messages.append(msg)
        except TimeoutError:
            pass
        return messages

    def stop(self) -> None:
        """Shut down the mock server."""
        if self._connection is not None:
            self._connection.close()
        self.server.close()


@asynccontextmanager
async def create_n1_mock(
    tmp_path: pathlib.Path,
) -> AsyncIterator[N1Mock]:
    """Create and start an N1 mock server.

    Yields an N1Mock bound to a Unix socket in *tmp_path*.
    """
    socket_path = str(tmp_path / "n1.sock")

    if os.path.exists(socket_path):
        os.unlink(socket_path)

    mock = N1Mock(socket_path=socket_path)

    server = await asyncio.start_unix_server(
        mock._handle_client,
        path=socket_path,
    )
    mock.server = server

    try:
        yield mock
    finally:
        # Close connection + server directly; do NOT use
        # ``async with server`` which calls wait_closed()
        # and can hang if the handler hasn't finished yet.
        mock.stop()
