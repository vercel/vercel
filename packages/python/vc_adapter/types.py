from typing import Any, Callable, Awaitable, MutableMapping, Protocol, TypeAlias, TypedDict, Literal


Headers: TypeAlias = list[list[bytes]]
Message: TypeAlias = MutableMapping[str, Any]
Scope: TypeAlias = MutableMapping[str, Any]
Receive: TypeAlias = Callable[[], Awaitable[Message]]
Send: TypeAlias = Callable[[Message], Awaitable[None]]


class ASGI(Protocol):
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None: ...  # pragma: no cover


LifespanMode: TypeAlias = Literal["auto", "on", "off"]


class Response(TypedDict):
    status: int
    headers: Headers
    body: bytes


class WSGIStartResponse(Protocol):
    def __call__(
        self, status: str, headers: Headers, exc_info: Any | None = None,
    ) -> None: ...  # pragma: no cover


class WSGI(Protocol):
    def __call__(
        self,
        environ: MutableMapping[str, Any],
        start_response: WSGIStartResponse,
    ) -> Any: ...  # pragma: no cover
