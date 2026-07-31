from __future__ import annotations

import asyncio
import threading
import unittest
from unittest.mock import patch

from vercel_runtime.invocation_hooks import (
    _reset_invocation_hooks,
    attach_due_hooks,
    run_on_next_invocation,
)
from vercel_runtime.wait_until import WaitUntilCollector


class TestInvocationHooks(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _reset_invocation_hooks()

    def tearDown(self) -> None:
        _reset_invocation_hooks()

    async def test_one_shot_hook_runs_once(self) -> None:
        calls: list[str] = []

        def callback() -> None:
            calls.append("called")

        run_on_next_invocation("activate", callback)
        first = WaitUntilCollector()
        attach_due_hooks(first.wait_until)
        await first.drain()
        second = WaitUntilCollector()
        attach_due_hooks(second.wait_until)
        await second.drain()

        self.assertEqual(calls, ["called"])

    async def test_repeated_identical_registration_is_idempotent(self) -> None:
        def callback() -> None:
            return

        run_on_next_invocation("activate", callback)
        run_on_next_invocation("activate", callback)

    async def test_conflicting_registration_is_rejected(self) -> None:
        def first() -> None:
            return

        def second() -> None:
            return

        run_on_next_invocation("activate", first)
        with self.assertRaisesRegex(ValueError, "differently"):
            run_on_next_invocation("activate", second)

    async def test_interval_hook_only_runs_when_due(self) -> None:
        calls: list[str] = []

        def callback() -> None:
            calls.append("called")

        with patch(
            "vercel_runtime.invocation_hooks.monotonic",
            side_effect=[100.0, 100.0, 100.0, 159.0, 160.0, 160.0],
        ):
            run_on_next_invocation(
                "activity",
                callback,
                repeat_after_seconds=60,
            )
            for _ in range(4):
                collector = WaitUntilCollector()
                attach_due_hooks(collector.wait_until)
                await collector.drain()

        self.assertEqual(calls, ["called", "called"])

    async def test_concurrent_invocations_share_running_hook(self) -> None:
        entered = threading.Event()
        release = threading.Event()
        calls = 0

        def callback() -> None:
            nonlocal calls
            calls += 1
            entered.set()
            release.wait(timeout=5)

        run_on_next_invocation("activate", callback)
        first = WaitUntilCollector()
        attach_due_hooks(first.wait_until)
        first_drain = asyncio.create_task(first.drain())
        self.assertTrue(await asyncio.to_thread(entered.wait, 1))

        second = WaitUntilCollector()
        attach_due_hooks(second.wait_until)
        await second.drain()
        release.set()
        await first_drain

        self.assertEqual(calls, 1)

    async def test_failed_hook_retries_after_backoff(self) -> None:
        attempts = 0

        def callback() -> None:
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                msg = "try again"
                raise RuntimeError(msg)

        with patch(
            "vercel_runtime.invocation_hooks.monotonic",
            side_effect=[100.0, 100.0, 101.0],
        ):
            run_on_next_invocation("retry", callback)
            first = WaitUntilCollector()
            attach_due_hooks(first.wait_until)
            with self.assertLogs(
                "vercel_runtime.invocation_hooks",
                level="ERROR",
            ):
                await first.drain()

            second = WaitUntilCollector()
            attach_due_hooks(second.wait_until)
            await second.drain()

        self.assertEqual(attempts, 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
