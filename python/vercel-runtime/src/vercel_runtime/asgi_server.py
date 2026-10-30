from __future__ import annotations

from typing import TYPE_CHECKING

from vercel_runtime._vendor import uvicorn

if TYPE_CHECKING:
    import socket
    from collections.abc import Callable


class ReadyAnnouncingServer(uvicorn.Server):
    """Uvicorn server that reports when the application is ready.

    ``on_ready`` runs once lifespan startup completes and the server accepts
    connections. ``on_startup_failed`` runs if the server stops before then,
    because the application reported a lifespan startup failure.
    """

    def __init__(
        self,
        config: uvicorn.Config,
        *,
        on_ready: Callable[[], None],
        on_startup_failed: Callable[[], None],
    ) -> None:
        super().__init__(config)
        self._on_ready = on_ready
        self._on_startup_failed = on_startup_failed

    async def startup(
        self,
        sockets: list[socket.socket] | None = None,
    ) -> None:
        # Uvicorn completes lifespan startup before it accepts connections,
        # so traffic arrives only once the application is ready.
        await super().startup(sockets=sockets)
        if self.started and not self.should_exit:
            self._on_ready()

    def run(
        self,
        sockets: list[socket.socket] | None = None,
    ) -> None:
        super().run(sockets=sockets)
        if not self.started:
            self._on_startup_failed()
