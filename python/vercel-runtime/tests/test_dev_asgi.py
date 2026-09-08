from __future__ import annotations

import asyncio
import unittest
from typing import Any

from vercel_runtime import dev, get_deadline
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

    async def test_deadline_is_available_and_header_is_stripped(self) -> None:
        observed: dict[str, Any] = {}

        async def user_app(
            scope: dict[str, Any],
            receive: Any,
            send: Any,
        ) -> None:
            observed["deadline"] = get_deadline()
            observed["headers"] = scope["headers"]
            await asyncio.sleep(0)

        dev._asgi_user_app = user_app
        await dev.asgi_app(
            {
                "type": "http",
                "path": "/",
                "headers": [
                    (
                        b"x-vercel-internal-deadline",
                        b"2026-08-18T12:30:45Z",
                    ),
                    (b"X-Vercel-Internal-Unknown", b"secret"),
                ],
            },
            self._receive,
            self._send,
        )

        self.assertEqual(
            observed["deadline"].isoformat(),
            "2026-08-18T12:30:45+00:00",
        )
        self.assertEqual(observed["headers"], [])
        self.assertIsNone(get_deadline())


class TestDevWsgiApp(unittest.TestCase):
    def setUp(self) -> None:
        self._original_app = dev._wsgi_user_app

    def tearDown(self) -> None:
        dev._wsgi_user_app = self._original_app

    def test_deadline_is_available_and_header_is_stripped(self) -> None:
        observed: dict[str, Any] = {}

        def user_app(
            environ: dict[str, Any], start_response: Any
        ) -> list[bytes]:
            observed["deadline"] = get_deadline()
            observed["header"] = "HTTP_X_VERCEL_INTERNAL_DEADLINE" in environ
            observed["unknown_header"] = (
                "HTTP_X_VERCEL_INTERNAL_UNKNOWN" in environ
            )
            start_response("200 OK", [])
            return [b"ok"]

        dev._wsgi_user_app = user_app

        def start_response(
            status: str,
            headers: list[tuple[str, str]],
        ) -> None:
            return None

        result = dev.wsgi_app(
            {
                "PATH_INFO": "/",
                "REQUEST_METHOD": "GET",
                "HTTP_X_VERCEL_INTERNAL_DEADLINE": ("2026-08-18T12:30:45Z"),
                "HTTP_X_VERCEL_INTERNAL_UNKNOWN": "secret",
            },
            start_response,
        )
        self.assertEqual(list(result), [b"ok"])

        self.assertEqual(
            observed["deadline"].isoformat(),
            "2026-08-18T12:30:45+00:00",
        )
        self.assertFalse(observed["header"])
        self.assertFalse(observed["unknown_header"])
        self.assertIsNone(get_deadline())
