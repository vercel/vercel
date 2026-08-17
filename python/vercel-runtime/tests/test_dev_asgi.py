from __future__ import annotations

import asyncio
import unittest
from typing import Any

from vercel_runtime import dev
from vercel_runtime.invocation_hooks import (
    _hooks,
    _reset_invocation_hooks,
    run_on_next_invocation,
)


class TestDevAsgiAppScopes(unittest.IsolatedAsyncioTestCase):
    """The dev server wraps only HTTP requests in a wait_until collector.

    A lifespan (or websocket) connection stays open until shutdown, so
    attaching invocation hooks to its collector would mark them running for
    the process lifetime and starve every real request of them.
    """

    def setUp(self) -> None:
        _reset_invocation_hooks()
        self._original_app = dev._asgi_user_app
        self._scopes: list[str] = []
        self._hook_runs: list[str] = []

        async def user_app(
            scope: dict[str, Any],
            receive: Any,
            send: Any,
        ) -> None:
            self._scopes.append(scope["type"])
            await asyncio.sleep(0)

        dev._asgi_user_app = user_app
        run_on_next_invocation(
            "test:hook",
            lambda: self._hook_runs.append("ran"),
        )

    def tearDown(self) -> None:
        dev._asgi_user_app = self._original_app
        _reset_invocation_hooks()

    async def _receive(self) -> dict[str, Any]:
        return {"type": "http.request"}

    async def _send(self, message: dict[str, Any]) -> None:
        return None

    async def test_lifespan_scope_leaves_hooks_untouched(self) -> None:
        await dev.asgi_app({"type": "lifespan"}, self._receive, self._send)

        self.assertEqual(self._scopes, ["lifespan"])
        self.assertEqual(self._hook_runs, [])
        self.assertFalse(_hooks["test:hook"].running)

    async def test_first_http_request_still_runs_due_hooks(self) -> None:
        await dev.asgi_app({"type": "lifespan"}, self._receive, self._send)
        await dev.asgi_app(
            {"type": "http", "path": "/", "headers": []},
            self._receive,
            self._send,
        )

        self.assertEqual(self._scopes, ["lifespan", "http"])
        self.assertEqual(self._hook_runs, ["ran"])
