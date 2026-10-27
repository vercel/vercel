from __future__ import annotations

import asyncio
import contextlib
import io
import os
import signal
import tempfile
import textwrap
import time
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast
from unittest.mock import patch

import vercel_runtime.schedules as vrs
from vercel_runtime import deadline

DISPATCH_HEADERS: dict[str, str] = {
    "ce-specversion": "1.0",
    "ce-type": "com.vercel.schedule.v1beta",
    "ce-source": "/schedule/default/nightly",
    "ce-id": "01JABCDEF0123456789012345:1788350400000",
    "ce-vssscheduledat": "2026-09-02T14:00:00+02:00",
    "ce-vssscheduleid": "01JABCDEF0123456789012345",
    "ce-vssschedulename": "nightly",
    "ce-vssnamespace": "default",
    "ce-vssschedulesource": "static",
}

SCHEDULE_ENV = {
    "VERCEL_SCHEDULE_EVENT_VERSION": "1",
    "VERCEL_SCHEDULE_ID": "01JABCDEF0123456789012345",
    "VERCEL_SCHEDULE_EXECUTION_ID": "01JABCDEF0123456789012345:1788350400000",
    "VERCEL_SCHEDULE_NAME": "nightly",
    "VERCEL_SCHEDULE_NAMESPACE": "default",
    "VERCEL_SCHEDULE_SCHEDULED_AT": "2026-09-02T12:00:00.000Z",
    "VERCEL_SCHEDULE_SOURCE": "static",
}


class TestScheduleEnvFromHeaders(unittest.TestCase):
    def test_maps_headers_and_normalizes_the_time_to_utc(self) -> None:
        self.assertEqual(
            vrs.schedule_env_from_headers(DISPATCH_HEADERS), SCHEDULE_ENV
        )

    def test_rejects_invalid_dispatches(self) -> None:
        cases = {
            "spec version": {**DISPATCH_HEADERS, "ce-specversion": "0.3"},
            "CloudEvent type": {**DISPATCH_HEADERS, "ce-type": "other"},
            "ce-vssschedulename": {
                k: v
                for k, v in DISPATCH_HEADERS.items()
                if k != "ce-vssschedulename"
            },
            "timezone offset": {
                **DISPATCH_HEADERS,
                "ce-vssscheduledat": "2026-09-02T12:00:00",
            },
        }
        for reason, headers in cases.items():
            with (
                self.subTest(reason),
                self.assertRaisesRegex(vrs.ScheduleDispatchError, reason),
            ):
                vrs.schedule_env_from_headers(headers)


class TestCreateScheduleScriptsApp(unittest.TestCase):
    def test_rejects_invalid_scripts(self) -> None:
        cases: dict[str, dict[str, str]] = {
            "no schedules given": {},
            "name is empty": {"": "job.py"},
            'schedule "nightly": path is empty': {"nightly": ""},
        }
        for reason, scripts in cases.items():
            with (
                self.subTest(reason),
                self.assertRaisesRegex(ValueError, reason),
            ):
                vrs.create_schedule_scripts_app(scripts)


class TestScheduleScriptApp(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def app(self, source: str) -> vrs._ScheduleScriptApp:
        return self.apps({"nightly": source})

    def apps(self, sources: dict[str, str]) -> vrs._ScheduleScriptApp:
        """Build one app serving a script per schedule name."""
        scripts: dict[str, str] = {}
        for name, source in sources.items():
            path = Path(self.tmp.name) / f"{name}.py"
            path.write_text(textwrap.dedent(source))
            scripts[name] = str(path)
        return cast(
            "vrs._ScheduleScriptApp", vrs.create_schedule_scripts_app(scripts)
        )

    def headers_for(self, name: str) -> dict[str, str]:
        return {**DISPATCH_HEADERS, "ce-vssschedulename": name}

    async def call(
        self,
        app: vrs._ScheduleScriptApp,
        *,
        method: str = "POST",
        headers: dict[str, str] | None = None,
    ) -> int:
        scope = {
            "type": "http",
            "method": method,
            "headers": [
                (k.encode(), v.encode())
                for k, v in (headers or DISPATCH_HEADERS).items()
            ],
        }
        sent: list[dict[str, Any]] = []

        async def receive() -> dict[str, Any]:
            await asyncio.sleep(0)
            return {"type": "http.request", "body": b""}

        async def send(message: dict[str, Any]) -> None:
            await asyncio.sleep(0)
            sent.append(message)

        await app(scope, receive, send)
        return int(sent[0]["status"])

    async def test_rejects_non_post_and_invalid_dispatch_without_running(
        self,
    ) -> None:
        marker = Path(self.tmp.name) / "ran"
        app = self.app(f"open({str(marker)!r}, 'w').close()")

        self.assertEqual(await self.call(app, method="GET"), 405)
        with self.assertLogs("vercel.schedules", level="WARNING"):
            status = await self.call(app, headers={"ce-type": "other"})
        self.assertEqual(status, 400)
        self.assertFalse(marker.exists())

    async def test_runs_the_script_with_the_schedule_env(self) -> None:
        app = self.app("""
                import logging, os, sys
                print(os.environ["VERCEL_SCHEDULE_NAME"], sys.argv[1:])
                print(os.environ["VERCEL_SCHEDULE_SCHEDULED_AT"])
                print(os.environ.get("VERCEL_SCHEDULE_STALE"))
                print(os.environ["TRACEPARENT"])
                logging.warning("almost done")
            """)
        stdout = io.StringIO()
        headers = {**DISPATCH_HEADERS, "traceparent": "00-abc-def-01"}

        with (
            patch.dict(os.environ, {"VERCEL_SCHEDULE_STALE": "leak"}),
            contextlib.redirect_stdout(stdout),
            self.assertLogs("vercel.schedules.script", level="INFO") as logs,
        ):
            status = await self.call(app, headers=headers)

        self.assertEqual(status, 200)
        self.assertEqual(
            stdout.getvalue().splitlines(),
            [
                "nightly []",
                "2026-09-02T12:00:00.000Z",
                "None",
                "00-abc-def-01",
            ],
        )
        self.assertEqual(
            logs.output, ["WARNING:vercel.schedules.script:almost done"]
        )

    async def test_runs_the_script_for_the_dispatched_schedule(self) -> None:
        app = self.apps(
            {
                "nightly": "print('nightly ran')",
                "hourly": "print('hourly ran')",
            }
        )

        for name in ("hourly", "nightly"):
            stdout = io.StringIO()
            with self.subTest(name), contextlib.redirect_stdout(stdout):
                status = await self.call(app, headers=self.headers_for(name))
            self.assertEqual(status, 200)
            self.assertEqual(stdout.getvalue().splitlines(), [f"{name} ran"])

    async def test_rejects_an_unrecognized_schedule_without_running(
        self,
    ) -> None:
        marker = Path(self.tmp.name) / "ran"
        app = self.apps(
            {
                "nightly": f"open({str(marker)!r}, 'w').close()",
                "hourly": f"open({str(marker)!r}, 'w').close()",
            }
        )

        with self.assertLogs("vercel.schedules", level="WARNING") as logs:
            status = await self.call(app, headers=self.headers_for("weekly"))

        self.assertEqual(status, 400)
        self.assertFalse(marker.exists())
        self.assertIn(
            'unrecognized schedule "weekly": this function runs '
            '"hourly", "nightly"',
            logs.output[-1],
        )

    async def test_forwards_lines_longer_than_the_read_limit(self) -> None:
        app = self.app("print('x' * 200_000); print('after')")
        stdout = io.StringIO()

        with contextlib.redirect_stdout(stdout):
            status = await self.call(app)

        self.assertEqual(status, 200)
        lines = stdout.getvalue().splitlines()
        self.assertEqual("".join(lines[:-1]), "x" * 200_000)
        self.assertTrue(all(len(line) <= 64 * 1024 for line in lines))
        self.assertEqual(lines[-1], "after")

    async def test_stops_what_the_script_left_running_when_it_exits(
        self,
    ) -> None:
        # The child inherits stdout, so the firing only ends this quickly,
        # with nothing dropped, if the child was killed.
        app = self.app("""
                import subprocess, sys
                subprocess.Popen(
                    [sys.executable, "-c", "import time; time.sleep(60)"]
                )
                print("done")
            """)
        stdout = io.StringIO()
        started = time.monotonic()

        with (
            contextlib.redirect_stdout(stdout),
            self.assertNoLogs("vercel.schedules", level="WARNING"),
        ):
            status = await self.call(app)

        self.assertEqual(status, 200)
        self.assertLess(time.monotonic() - started, 10)
        self.assertEqual(stdout.getvalue().splitlines(), ["done"])

    async def test_drops_output_of_a_process_that_left_the_group(
        self,
    ) -> None:
        app = self.app("""
                import subprocess, sys
                child = subprocess.Popen(
                    [sys.executable, "-c", "import time; time.sleep(60)"],
                    start_new_session=True,
                )
                print(child.pid)
            """)
        stdout = io.StringIO()
        started = time.monotonic()

        with (
            patch.object(vrs, "_DRAIN_SECONDS", 0.2),
            contextlib.redirect_stdout(stdout),
            self.assertLogs("vercel.schedules", level="WARNING") as logs,
        ):
            status = await self.call(app)
        with contextlib.suppress(ProcessLookupError, ValueError):
            os.kill(int(stdout.getvalue()), signal.SIGKILL)

        self.assertEqual(status, 200)
        self.assertLess(time.monotonic() - started, 10)
        self.assertIn("outside its process group", logs.output[-1])

    async def test_fails_the_firing_on_non_zero_exit(self) -> None:
        app = self.app("import sys; sys.exit(3)")

        with self.assertLogs("vercel.schedules", level="ERROR") as logs:
            status = await self.call(app)

        self.assertEqual(status, 500)
        self.assertIn("exited with status 3", logs.output[-1])

    async def test_logs_an_uncaught_exception_with_its_traceback(
        self,
    ) -> None:
        app = self.app("raise RuntimeError('boom')")

        with self.assertLogs("vercel.schedules", level="ERROR") as logs:
            status = await self.call(app)

        self.assertEqual(status, 500)
        raised = next(line for line in logs.output if "raised" in line)
        self.assertIn("RuntimeError: boom", raised)

    async def test_keeps_output_printed_before_a_deadline_kill(self) -> None:
        app = self.app("""
                import signal, time
                signal.signal(signal.SIGTERM, signal.SIG_IGN)
                print("last words")
                time.sleep(60)
            """)
        token = deadline.set_deadline(
            (datetime.now(UTC) + timedelta(seconds=1))
            .isoformat()
            .replace("+00:00", "Z")
        )
        self.addCleanup(deadline.reset_deadline, token)
        stdout = io.StringIO()

        with (
            patch.object(vrs, "_TERM_MARGIN_SECONDS", 0.5),
            patch.object(vrs, "_KILL_GRACE_SECONDS", 0.5),
            contextlib.redirect_stdout(stdout),
            self.assertLogs("vercel.schedules", level="ERROR") as logs,
        ):
            status = await self.call(app)

        self.assertEqual(status, 500)
        self.assertIn("terminated by signal 9", logs.output[-1])
        self.assertEqual(stdout.getvalue().splitlines(), ["last words"])

    async def test_stops_the_script_before_the_deadline(self) -> None:
        app = self.app("import time; time.sleep(60)")
        token = deadline.set_deadline(
            (datetime.now(UTC) + timedelta(seconds=1))
            .isoformat()
            .replace("+00:00", "Z")
        )
        self.addCleanup(deadline.reset_deadline, token)
        started = time.monotonic()

        with (
            patch.object(vrs, "_TERM_MARGIN_SECONDS", 0.5),
            self.assertLogs("vercel.schedules", level="ERROR") as logs,
        ):
            status = await self.call(app)

        self.assertEqual(status, 500)
        self.assertLess(time.monotonic() - started, 10)
        self.assertIn("terminated by signal 15", logs.output[-1])
