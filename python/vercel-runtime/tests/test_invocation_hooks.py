from __future__ import annotations

import asyncio
import unittest
from unittest.mock import patch

from vercel_runtime.invocation_hooks import (
    _reset_invocation_hooks,
    register_invocation_hook,
    schedule_invocation_hooks,
)
from vercel_runtime.wait_until import WaitUntilCollector


class TestInvocationHooks(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _reset_invocation_hooks()

    def tearDown(self) -> None:
        _reset_invocation_hooks()

    async def test_one_shot_hook_runs_once(self) -> None:
        calls: list[str] = []

        async def callback() -> None:
            calls.append("called")

        register_invocation_hook("activate", callback)
        first = WaitUntilCollector()
        schedule_invocation_hooks(first.wait_until)
        await first.drain()
        second = WaitUntilCollector()
        schedule_invocation_hooks(second.wait_until)
        await second.drain()

        self.assertEqual(calls, ["called"])

    async def test_repeated_identical_registration_is_idempotent(self) -> None:
        async def callback() -> None:
            return

        register_invocation_hook("activate", callback)
        register_invocation_hook("activate", callback)

    async def test_conflicting_registration_is_rejected(self) -> None:
        async def first() -> None:
            return

        async def second() -> None:
            return

        register_invocation_hook("activate", first)
        with self.assertRaisesRegex(ValueError, "differently"):
            register_invocation_hook("activate", second)

    async def test_interval_hook_only_runs_when_due(self) -> None:
        calls: list[str] = []

        async def callback() -> None:
            calls.append("called")

        with patch(
            "vercel_runtime.invocation_hooks.monotonic",
            side_effect=[100.0, 100.0, 100.0, 159.0, 160.0, 160.0],
        ):
            register_invocation_hook(
                "activity",
                callback,
                min_interval_seconds=60,
            )
            for _ in range(4):
                collector = WaitUntilCollector()
                schedule_invocation_hooks(collector.wait_until)
                await collector.drain()

        self.assertEqual(calls, ["called", "called"])

    async def test_concurrent_invocations_share_running_hook(self) -> None:
        entered = asyncio.Event()
        release = asyncio.Event()
        calls = 0

        async def callback() -> None:
            nonlocal calls
            calls += 1
            entered.set()
            await release.wait()

        register_invocation_hook("activate", callback)
        first = WaitUntilCollector()
        schedule_invocation_hooks(first.wait_until)
        first_drain = asyncio.create_task(first.drain())
        await entered.wait()

        second = WaitUntilCollector()
        schedule_invocation_hooks(second.wait_until)
        await second.drain()
        release.set()
        await first_drain

        self.assertEqual(calls, 1)

    async def test_failed_hook_retries_after_backoff(self) -> None:
        attempts = 0

        async def callback() -> None:
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                msg = "try again"
                raise RuntimeError(msg)

        with patch(
            "vercel_runtime.invocation_hooks.monotonic",
            side_effect=[100.0, 100.0, 101.0],
        ):
            register_invocation_hook("retry", callback)
            first = WaitUntilCollector()
            schedule_invocation_hooks(first.wait_until)
            with self.assertLogs(
                "vercel_runtime.invocation_hooks",
                level="ERROR",
            ):
                await first.drain()

            second = WaitUntilCollector()
            schedule_invocation_hooks(second.wait_until)
            await second.drain()

        self.assertEqual(attempts, 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
