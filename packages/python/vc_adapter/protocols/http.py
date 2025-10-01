import asyncio
import enum
import logging
from io import BytesIO

from ..exceptions import UnexpectedMessage
from ..types import ASGI, Message, Response, Scope
from ..utils import get_asyncio_queue


class HTTPCycleState(enum.Enum):
    """
    The state of the ASGI `http` connection.
    * **REQUEST** - Initial state. The ASGI application instance will be run with the
    connection scope containing the `http` type.
    * **RESPONSE** - The `http.response.start` event has been sent by the application.
    The next expected message is the `http.response.body` event, containing the body
    content. An application may pass the `more_body` argument to send content in chunks,
    however content will always be returned in a single response, never streamed.
    * **COMPLETE** - The body content from the ASGI application has been completely
    read. A disconnect event will be sent to the application, and the response will
    be returned.
    """

    REQUEST = enum.auto()
    RESPONSE = enum.auto()
    COMPLETE = enum.auto()


class HTTPCycle:
    def __init__(self, scope: Scope, body: bytes, loop: asyncio.AbstractEventLoop | None = None) -> None:
        self.scope = scope
        self.buffer = BytesIO()
        self.state = HTTPCycleState.REQUEST
        self.logger = logging.getLogger("vc_init.http")
        self.loop = loop
        self.app_queue: asyncio.Queue[Message] = get_asyncio_queue(self.loop)
        self.app_queue.put_nowait(
            {
                "type": "http.request",
                "body": body,
                "more_body": False,
            }
        )

    def __call__(self, app: ASGI) -> Response:
        asgi_instance = self.run(app)
        if self.loop is not None:
            fut = asyncio.run_coroutine_threadsafe(asgi_instance, self.loop)
            fut.result()
        else:
            loop = asyncio.get_event_loop()
            asgi_task = loop.create_task(asgi_instance)
            loop.run_until_complete(asgi_task)

        return {
            "status": self.status,
            "headers": self.headers,
            "body": self.body,
        }

    async def run(self, app: ASGI) -> None:
        try:
            await app(self.scope, self.receive, self.send)
        except BaseException:
            self.logger.exception("An error occurred running the application.")
            if self.state is HTTPCycleState.REQUEST:
                await self.send(
                    {
                        "type": "http.response.start",
                        "status": 500,
                        "headers": [[b"content-type", b"text/plain; charset=utf-8"]],
                    }
                )
                await self.send(
                    {
                        "type": "http.response.body",
                        "body": b"Internal Server Error",
                        "more_body": False,
                    }
                )
            elif self.state is not HTTPCycleState.COMPLETE:
                self.status = 500
                self.body = b"Internal Server Error"
                self.headers = [[b"content-type", b"text/plain; charset=utf-8"]]

    async def receive(self) -> Message:
        return await self.app_queue.get()  # pragma: no cover

    async def send(self, message: Message) -> None:
        if self.state is HTTPCycleState.REQUEST and message["type"] == "http.response.start":
            self.status = message["status"]
            self.headers = message.get("headers", [])
            self.state = HTTPCycleState.RESPONSE
        elif self.state is HTTPCycleState.RESPONSE and message["type"] == "http.response.body":
            body = message.get("body", b"")
            more_body = message.get("more_body", False)
            self.buffer.write(body)
            if not more_body:
                self.body = self.buffer.getvalue()
                self.buffer.close()

                self.state = HTTPCycleState.COMPLETE
                await self.app_queue.put({"type": "http.disconnect"})

                self.logger.info(
                    "%s %s %s",
                    self.scope["method"],
                    self.scope["path"],
                    self.status,
                )
        else:
            raise UnexpectedMessage(f"Unexpected {message['type']}")
