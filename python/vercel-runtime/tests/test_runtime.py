"""Integration tests for vc_init.py."""

from __future__ import annotations

import asyncio
import base64
import contextlib
import http.client
import json
import os
import pathlib
import shutil
import socket
import sys
import tempfile
import unittest
from typing import TYPE_CHECKING, Any

from tests._dist import PROJECT_ROOT

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

from tests._n1_mock import (
    EndMessage,
    HandlerStartedMessage,
    LogMessage,
    N1Mock,
    ServerStartedMessage,
    create_n1_mock,
)

_VC_INIT = PROJECT_ROOT / "src" / "vercel_runtime" / "vc_init.py"
_TEST_ROOT = pathlib.Path(__file__).parent
_COV_WRAPPER = _TEST_ROOT / "_cov_wrapper.py"
_LAMBDA_INVOKER = _TEST_ROOT / "fixtures" / "lambda_invoke.py"
_FIXTURES = _TEST_ROOT / "fixtures"


def _make_entrypoint(
    fixture_name: str,
    tmp_path: pathlib.Path,
) -> tuple[pathlib.Path, str, str]:
    src = _FIXTURES / fixture_name
    dst = tmp_path / fixture_name
    shutil.copy2(src, dst)
    return dst, fixture_name, fixture_name.removesuffix(".py")


def _coverage_active() -> bool:
    """Check if coverage collection is active in this process."""
    try:
        from coverage import Coverage

        c = Coverage.current()
        if c is not None:
            return True
    except ImportError:
        pass
    return "COV_CORE_DATAFILE" in os.environ


def _base_env() -> dict[str, str]:
    """Return a clean env without stale ``__VC_*`` vars."""
    return {k: v for k, v in os.environ.items() if not k.startswith("__VC_")}


@contextlib.asynccontextmanager
async def _run_runtime(
    *,
    entrypoint_abs: pathlib.Path,
    entrypoint_rel: str,
    module_name: str,
    ipc_socket_path: str,
) -> AsyncIterator[asyncio.subprocess.Process]:
    env = {
        **_base_env(),
        "__VC_HANDLER_ENTRYPOINT": entrypoint_rel,
        "__VC_HANDLER_ENTRYPOINT_ABS": str(entrypoint_abs),
        "__VC_HANDLER_MODULE_NAME": module_name,
        "VERCEL_IPC_PATH": ipc_socket_path,
    }
    cmd = [sys.executable]
    if _coverage_active():
        cmd.append(str(_COV_WRAPPER))
    cmd.append(str(_VC_INIT))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        yield proc
    finally:
        if proc.returncode is None:
            proc.terminate()
            try:
                async with asyncio.timeout(3.0):
                    await proc.wait()
            except TimeoutError:
                proc.kill()
                await proc.wait()


def _lambda_event(
    method: str,
    path: str,
    headers: dict[str, str | list[str]] | None = None,
    body: str | None = None,
    encoding: str | None = None,
) -> dict[str, Any]:
    """Build a Lambda event dict for vc_handler."""
    payload: dict[str, Any] = {
        "method": method,
        "path": path,
        "headers": headers or {},
    }
    if body is not None:
        payload["body"] = body
    if encoding is not None:
        payload["encoding"] = encoding
    return {"body": json.dumps(payload)}


async def _invoke_lambda(
    *,
    entrypoint_abs: pathlib.Path,
    entrypoint_rel: str,
    module_name: str,
    event: dict[str, Any],
) -> dict[str, Any]:
    """Run vc_init.py in legacy mode and call vc_handler.

    Uses an extra pipe (fd 3) so vc_init.py's own print()
    calls don't pollute the JSON result.
    """
    env = {
        **_base_env(),
        "__VC_HANDLER_ENTRYPOINT": entrypoint_rel,
        "__VC_HANDLER_ENTRYPOINT_ABS": str(entrypoint_abs),
        "__VC_HANDLER_MODULE_NAME": module_name,
    }
    env.pop("VERCEL_IPC_PATH", None)

    result_r, result_w = os.pipe()
    env["_RESULT_FD"] = str(result_w)

    cmd = [sys.executable]
    if _coverage_active():
        cmd.append(str(_COV_WRAPPER))
    cmd.extend([str(_LAMBDA_INVOKER), str(_VC_INIT)])

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        env=env,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        pass_fds=(result_w,),
    )
    os.close(result_w)

    try:
        assert proc.stdin is not None
        proc.stdin.write(json.dumps(event).encode())
        proc.stdin.close()

        loop = asyncio.get_running_loop()
        result_data, _ = await asyncio.wait_for(
            asyncio.gather(
                loop.run_in_executor(
                    None,
                    lambda: os.read(result_r, 1_000_000),
                ),
                proc.wait(),
            ),
            timeout=10.0,
        )
    finally:
        os.close(result_r)

    if proc.returncode != 0:
        assert proc.stderr is not None
        stderr_text = (await proc.stderr.read()).decode()
        raise RuntimeError(
            f"Lambda invoke failed (rc={proc.returncode}):\n{stderr_text}"
        )
    result: dict[str, Any] = json.loads(result_data)
    return result


def _http_request(
    port: int,
    method: str = "GET",
    path: str = "/",
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> http.client.HTTPResponse:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    all_headers = {
        "x-vercel-internal-invocation-id": "test-inv-1",
        "x-vercel-internal-request-id": "42",
        "x-vercel-internal-span-id": "span-1",
        "x-vercel-internal-trace-id": "trace-1",
        **(headers or {}),
    }
    conn.request(method, path, body=body, headers=all_headers)
    return conn.getresponse()


async def _http_get(
    port: int,
    path: str = "/",
    headers: dict[str, str] | None = None,
) -> http.client.HTTPResponse:
    return await asyncio.to_thread(
        _http_request, port, "GET", path, None, headers
    )


async def _http_post(
    port: int,
    path: str = "/",
    body: bytes = b"",
    headers: dict[str, str] | None = None,
) -> http.client.HTTPResponse:
    return await asyncio.to_thread(
        _http_request, port, "POST", path, body, headers
    )


async def _read_stderr(
    proc: asyncio.subprocess.Process,
) -> str:
    assert proc.stderr is not None
    return (await proc.stderr.read()).decode()


class _RuntimeTestCase(unittest.IsolatedAsyncioTestCase):
    """Base providing ``self.tmp_path`` and ``self.n1``."""

    tmp_path: pathlib.Path
    n1: N1Mock
    _tmp_dir: tempfile.TemporaryDirectory[str]
    _n1_ctx: contextlib.AsyncExitStack

    def setUp(self) -> None:
        self._tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = pathlib.Path(self._tmp_dir.name)

    async def asyncSetUp(self) -> None:
        self._n1_ctx = contextlib.AsyncExitStack()
        self.n1 = await self._n1_ctx.enter_async_context(
            create_n1_mock(self.tmp_path)
        )

    async def asyncTearDown(self) -> None:
        await self._n1_ctx.aclose()

    def tearDown(self) -> None:
        self._tmp_dir.cleanup()


class TestHTTPHandler(_RuntimeTestCase):
    """Tests for BaseHTTPRequestHandler entrypoints."""

    async def test_server_started_get_post_ping_lifecycle(
        self,
    ) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("http_handler.py", self.tmp_path)
        async with _run_runtime(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            ipc_socket_path=self.n1.socket_path,
        ):
            ss = await self.n1.wait_for_message(
                ServerStartedMessage, timeout=10.0
            )
            port = ss.payload.http_port
            self.assertIsInstance(port, int)
            self.assertGreater(port, 0)
            self.assertGreater(ss.payload.init_duration, 0)

            resp = await _http_get(port, "/hello")
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.read().decode(), "GET /hello")

            hs = await self.n1.wait_for_message(
                HandlerStartedMessage, timeout=5.0
            )
            self.assertGreater(hs.payload.handler_started_at, 0)
            end = await self.n1.wait_for_message(EndMessage, timeout=5.0)
            self.assertIsNotNone(end.payload.context.invocation_id)

            resp = await _http_post(port, "/submit", body=b"test-data")
            self.assertEqual(resp.status, 200)
            self.assertEqual(
                resp.read().decode(),
                "POST /submit body=test-data",
            )

            await self.n1.wait_for_message(HandlerStartedMessage, timeout=5.0)
            await self.n1.wait_for_message(EndMessage, timeout=5.0)

            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            conn.request("GET", "/_vercel/ping")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200)

    async def test_unsupported_method_returns_501(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("http_handler.py", self.tmp_path)
        async with _run_runtime(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            ipc_socket_path=self.n1.socket_path,
        ):
            ss = await self.n1.wait_for_message(
                ServerStartedMessage, timeout=10.0
            )
            port = ss.payload.http_port

            # http_handler.py only has do_GET and do_POST
            resp = await asyncio.to_thread(_http_request, port, "DELETE", "/x")
            self.assertEqual(resp.status, 501)
            resp.read()

    async def test_malformed_request_line(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("http_handler.py", self.tmp_path)
        async with _run_runtime(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            ipc_socket_path=self.n1.socket_path,
        ):
            ss = await self.n1.wait_for_message(
                ServerStartedMessage, timeout=10.0
            )
            port = ss.payload.http_port

            # Send garbage — covers parse_request() failure
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.connect(("127.0.0.1", port))
            sock.sendall(b"NOT-HTTP\r\n\r\n")
            data = sock.recv(4096)
            sock.close()
            self.assertIn(b"400", data)


class TestWSGIApp(_RuntimeTestCase):
    """Tests for WSGI app entrypoints."""

    async def test_wsgi_requests_and_lifecycle(
        self,
    ) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("wsgi_app.py", self.tmp_path)
        async with _run_runtime(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            ipc_socket_path=self.n1.socket_path,
        ):
            ss = await self.n1.wait_for_message(
                ServerStartedMessage, timeout=10.0
            )
            port = ss.payload.http_port

            resp = await _http_get(port, "/hello")
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.read().decode(), "GET /hello")

            await self.n1.wait_for_message(HandlerStartedMessage, timeout=5.0)
            await self.n1.wait_for_message(EndMessage, timeout=5.0)

            resp = await _http_get(port, "/search?q=test")
            self.assertEqual(resp.status, 200)
            self.assertEqual(
                resp.read().decode(),
                "GET /search?q=test",
            )

    async def test_wsgi_closeable_response(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint(
            "wsgi_closeable_app.py", self.tmp_path
        )
        async with _run_runtime(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            ipc_socket_path=self.n1.socket_path,
        ):
            ss = await self.n1.wait_for_message(
                ServerStartedMessage, timeout=10.0
            )
            port = ss.payload.http_port

            resp = await _http_get(port, "/close-test")
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.read().decode(), "GET /close-test")


class TestASGIApp(_RuntimeTestCase):
    """Tests for ASGI app entrypoints."""

    async def test_asgi_requests_ping_and_lifecycle(
        self,
    ) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("asgi_app.py", self.tmp_path)
        async with _run_runtime(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            ipc_socket_path=self.n1.socket_path,
        ):
            ss = await self.n1.wait_for_message(
                ServerStartedMessage, timeout=10.0
            )
            port = ss.payload.http_port
            self.assertGreater(ss.payload.init_duration, 0)

            resp = await _http_get(port, "/hello")
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.read().decode(), "GET /hello")

            hs = await self.n1.wait_for_message(
                HandlerStartedMessage, timeout=5.0
            )
            self.assertGreater(hs.payload.handler_started_at, 0)
            await self.n1.wait_for_message(EndMessage, timeout=5.0)

            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            conn.request("GET", "/_vercel/ping")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200)

    async def test_invalid_utf8_header(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("asgi_app.py", self.tmp_path)
        async with _run_runtime(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            ipc_socket_path=self.n1.socket_path,
        ):
            ss = await self.n1.wait_for_message(
                ServerStartedMessage, timeout=10.0
            )
            port = ss.payload.http_port

            # Send raw request with invalid UTF-8 in a header
            # value — covers _b2s() decode failure path
            raw = (
                b"GET /hello HTTP/1.1\r\n"
                b"Host: 127.0.0.1\r\n"
                b"x-vercel-internal-invocation-id: inv\r\n"
                b"x-vercel-internal-request-id: 1\r\n"
                b"x-vercel-internal-span-id: s\r\n"
                b"x-vercel-internal-trace-id: t\r\n"
                b"x-bad: \xff\xfe\r\n"
                b"\r\n"
            )
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.connect(("127.0.0.1", port))
            sock.sendall(raw)
            data = sock.recv(4096)
            sock.close()
            self.assertIn(b"200", data)


class TestLogging(_RuntimeTestCase):
    """Tests for IPC log message forwarding."""

    async def test_log_levels_and_print(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("logging_app.py", self.tmp_path)
        async with _run_runtime(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            ipc_socket_path=self.n1.socket_path,
        ):
            ss = await self.n1.wait_for_message(
                ServerStartedMessage, timeout=10.0
            )
            port = ss.payload.http_port

            resp = await _http_get(port, "/log-info")
            self.assertEqual(resp.status, 200)
            resp.read()
            log = await self.n1.wait_for_message(LogMessage, timeout=5.0)
            self.assertTrue(log.payload.message)
            self.assertEqual(log.payload.level, "info")
            await self.n1.wait_for_message(EndMessage, timeout=5.0)

            resp = await _http_get(port, "/log-warning")
            self.assertEqual(resp.status, 200)
            resp.read()
            log = await self.n1.wait_for_message(LogMessage, timeout=5.0)
            self.assertEqual(log.payload.level, "warn")
            await self.n1.wait_for_message(EndMessage, timeout=5.0)

            resp = await _http_get(port, "/log-error")
            self.assertEqual(resp.status, 200)
            resp.read()
            log = await self.n1.wait_for_message(LogMessage, timeout=5.0)
            self.assertEqual(log.payload.level, "error")
            await self.n1.wait_for_message(EndMessage, timeout=5.0)

            resp = await _http_get(port, "/log-critical")
            self.assertEqual(resp.status, 200)
            resp.read()
            log = await self.n1.wait_for_message(LogMessage, timeout=5.0)
            self.assertEqual(log.payload.level, "fatal")
            await self.n1.wait_for_message(EndMessage, timeout=5.0)

            resp = await _http_get(port, "/print-stdout")
            self.assertEqual(resp.status, 200)
            resp.read()
            log = await self.n1.wait_for_message(LogMessage, timeout=5.0)
            self.assertTrue(log.payload.message)
            self.assertEqual(log.payload.stream, "stdout")
            await self.n1.wait_for_message(EndMessage, timeout=5.0)

            # logger.error with exc_info=True (covers traceback formatting)
            resp = await _http_get(port, "/log-exc-info")
            self.assertEqual(resp.status, 200)
            resp.read()
            log = await self.n1.wait_for_message(LogMessage, timeout=5.0)
            self.assertEqual(log.payload.level, "error")
            # Message should contain the traceback
            decoded = base64.b64decode(log.payload.message).decode()
            self.assertIn("ValueError", decoded)
            self.assertIn("with traceback", decoded)


class TestErrorPaths(_RuntimeTestCase):
    """Tests for error handling in vc_init.py."""

    async def test_missing_handler_exits(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint(
            "missing_export.py", self.tmp_path
        )
        async with _run_runtime(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            ipc_socket_path=self.n1.socket_path,
        ) as proc:
            async with asyncio.timeout(10.0):
                returncode = await proc.wait()
            self.assertEqual(returncode, 1)

    async def test_bad_handler_subclass_exits(
        self,
    ) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("bad_handler.py", self.tmp_path)
        async with _run_runtime(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            ipc_socket_path=self.n1.socket_path,
        ) as proc:
            async with asyncio.timeout(10.0):
                returncode = await proc.wait()
            self.assertEqual(returncode, 1)
            stderr = await _read_stderr(proc)
            self.assertIn(
                "Handler must inherit from BaseHTTPRequestHandler",
                stderr,
            )

    async def test_missing_env_var_exits(self) -> None:
        env = _base_env()
        env["VERCEL_IPC_PATH"] = str(self.tmp_path / "n1.sock")

        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            str(_VC_INIT),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        async with asyncio.timeout(10.0):
            returncode = await proc.wait()
        self.assertEqual(returncode, 1)
        stderr = await _read_stderr(proc)
        self.assertIn("is not set", stderr)

    async def test_import_error_exits(self) -> None:
        bad_path = self.tmp_path / "nonexistent.py"
        async with _run_runtime(
            entrypoint_abs=bad_path,
            entrypoint_rel="nonexistent.py",
            module_name="nonexistent",
            ipc_socket_path=self.n1.socket_path,
        ) as proc:
            async with asyncio.timeout(10.0):
                returncode = await proc.wait()
            self.assertEqual(returncode, 1)
            stderr = await _read_stderr(proc)
            self.assertIn("Error importing", stderr)


class _LambdaTestCase(unittest.IsolatedAsyncioTestCase):
    """Base for Lambda handler tests (no N1 mock needed)."""

    tmp_path: pathlib.Path
    _tmp_dir: tempfile.TemporaryDirectory[str]

    def setUp(self) -> None:
        self._tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = pathlib.Path(self._tmp_dir.name)

    def tearDown(self) -> None:
        self._tmp_dir.cleanup()


class TestLambdaHTTPHandler(_LambdaTestCase):
    """Legacy Lambda mode with BaseHTTPRequestHandler."""

    async def test_get_request(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("http_handler.py", self.tmp_path)
        result = await _invoke_lambda(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            event=_lambda_event("GET", "/hello"),
        )
        self.assertEqual(result["statusCode"], 200)
        self.assertIn("GET /hello", result["body"])

    async def test_post_with_base64_body(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("http_handler.py", self.tmp_path)
        result = await _invoke_lambda(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            event=_lambda_event(
                "POST",
                "/submit",
                body=base64.b64encode(b"encoded").decode(),
                encoding="base64",
            ),
        )
        self.assertEqual(result["statusCode"], 200)
        self.assertIn("encoded", result["body"])

    async def test_binary_response_base64_encoded(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint(
            "binary_handler.py", self.tmp_path
        )
        result = await _invoke_lambda(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            event=_lambda_event("GET", "/"),
        )
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(result["encoding"], "base64")
        data = base64.b64decode(result["body"])
        self.assertEqual(data, bytes(range(128, 256)))


class TestLambdaWSGI(_LambdaTestCase):
    """Legacy Lambda mode with WSGI app."""

    async def test_get_request(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("wsgi_app.py", self.tmp_path)
        result = await _invoke_lambda(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            event=_lambda_event("GET", "/hello"),
        )
        self.assertEqual(result["statusCode"], 200)
        body = base64.b64decode(result["body"]).decode()
        self.assertEqual(body, "GET /hello")

    async def test_query_string(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("wsgi_app.py", self.tmp_path)
        result = await _invoke_lambda(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            event=_lambda_event("GET", "/search?q=test"),
        )
        self.assertEqual(result["statusCode"], 200)
        body = base64.b64decode(result["body"]).decode()
        self.assertEqual(body, "GET /search?q=test")

    async def test_post_with_base64_body(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("wsgi_app.py", self.tmp_path)
        result = await _invoke_lambda(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            event=_lambda_event(
                "POST",
                "/data",
                body=base64.b64encode(b"bin").decode(),
                encoding="base64",
            ),
        )
        self.assertEqual(result["statusCode"], 200)


class TestLambdaASGI(_LambdaTestCase):
    """Legacy Lambda mode with ASGI app."""

    async def test_get_request(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("asgi_app.py", self.tmp_path)
        result = await _invoke_lambda(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            event=_lambda_event("GET", "/hello"),
        )
        self.assertEqual(result["statusCode"], 200)
        body = base64.b64decode(result["body"]).decode()
        self.assertEqual(body, "GET /hello")

    async def test_base64_body(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("asgi_app.py", self.tmp_path)
        result = await _invoke_lambda(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            event=_lambda_event(
                "POST",
                "/data",
                body=base64.b64encode(b"bin").decode(),
                encoding="base64",
            ),
        )
        self.assertEqual(result["statusCode"], 200)

    async def test_repeated_headers(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("asgi_app.py", self.tmp_path)
        result = await _invoke_lambda(
            entrypoint_abs=ep_abs,
            entrypoint_rel=ep_rel,
            module_name=mod,
            event=_lambda_event(
                "GET",
                "/hello",
                headers={
                    "accept": ["text/html", "application/json"],
                },
            ),
        )
        self.assertEqual(result["statusCode"], 200)


class TestLambdaErrorPaths(_LambdaTestCase):
    """Legacy Lambda mode error paths."""

    async def test_missing_handler_exits(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint(
            "missing_export.py", self.tmp_path
        )
        with self.assertRaises(RuntimeError):
            await _invoke_lambda(
                entrypoint_abs=ep_abs,
                entrypoint_rel=ep_rel,
                module_name=mod,
                event=_lambda_event("GET", "/"),
            )

    async def test_bad_handler_exits(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint("bad_handler.py", self.tmp_path)
        with self.assertRaises(RuntimeError):
            await _invoke_lambda(
                entrypoint_abs=ep_abs,
                entrypoint_rel=ep_rel,
                module_name=mod,
                event=_lambda_event("GET", "/"),
            )

    async def test_asgi_bad_start_message(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint(
            "asgi_bad_start.py", self.tmp_path
        )
        with self.assertRaises(RuntimeError):
            await _invoke_lambda(
                entrypoint_abs=ep_abs,
                entrypoint_rel=ep_rel,
                module_name=mod,
                event=_lambda_event("GET", "/"),
            )

    async def test_asgi_bad_body_message(self) -> None:
        ep_abs, ep_rel, mod = _make_entrypoint(
            "asgi_bad_body.py", self.tmp_path
        )
        with self.assertRaises(RuntimeError):
            await _invoke_lambda(
                entrypoint_abs=ep_abs,
                entrypoint_rel=ep_rel,
                module_name=mod,
                event=_lambda_event("GET", "/"),
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
