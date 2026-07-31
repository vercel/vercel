from __future__ import annotations

import asyncio
import threading
import unittest
from contextvars import ContextVar

from vercel_runtime.wait_until import (
    WaitUntilCollector,
    begin_wait_until,
    finish_wait_until,
)


class TestWaitUntilCollector(unittest.IsolatedAsyncioTestCase):
    async def test_drains_registered_awaitables(self) -> None:
        calls: list[str] = []
        collector = WaitUntilCollector()

        async def work() -> None:
            await asyncio.sleep(0)
            calls.append("done")

        collector.wait_until(work())
        await collector.drain()

        self.assertEqual(calls, ["done"])

    async def test_deduplicates_the_same_awaitable(self) -> None:
        calls = 0
        collector = WaitUntilCollector()

        async def work() -> None:
            nonlocal calls
            await asyncio.sleep(0)
            calls += 1

        coroutine = work()
        collector.wait_until(coroutine)
        collector.wait_until(coroutine)
        await collector.drain()

        self.assertEqual(calls, 1)

    async def test_drains_work_registered_by_work(self) -> None:
        calls: list[str] = []
        collector = WaitUntilCollector()

        async def child() -> None:
            await asyncio.sleep(0)
            calls.append("child")

        async def parent() -> None:
            await asyncio.sleep(0)
            calls.append("parent")
            collector.wait_until(child())

        collector.wait_until(parent())
        await collector.drain()

        self.assertEqual(calls, ["parent", "child"])

    async def test_logs_errors_without_raising(self) -> None:
        collector = WaitUntilCollector()

        async def fail() -> None:
            await asyncio.sleep(0)
            msg = "boom"
            raise RuntimeError(msg)

        collector.wait_until(fail())
        with self.assertLogs("vercel_runtime.wait_until", level="ERROR"):
            await collector.drain()

    async def test_captures_registration_context(self) -> None:
        value: ContextVar[str] = ContextVar("value", default="unset")
        observed: list[str] = []
        collector = WaitUntilCollector()

        async def work() -> None:
            await asyncio.sleep(0)
            observed.append(value.get())

        value.set("registered")
        collector.wait_until(work())
        value.set("drained")
        await collector.drain()

        self.assertEqual(observed, ["registered"])

    async def test_rejects_work_after_drain(self) -> None:
        collector = WaitUntilCollector()
        await collector.drain()

        async def work() -> None:
            await asyncio.sleep(0)

        with self.assertRaisesRegex(RuntimeError, "invocation ended"):
            collector.wait_until(work())

    async def test_rejects_non_awaitable(self) -> None:
        collector = WaitUntilCollector()
        with self.assertRaisesRegex(TypeError, "awaitable"):
            collector.wait_until(None)  # type: ignore[arg-type]

    async def test_concurrent_registration_is_safe(self) -> None:
        collector = WaitUntilCollector()
        calls: list[int] = []

        async def work(value: int) -> None:
            await asyncio.sleep(0)
            calls.append(value)

        threads = [
            threading.Thread(
                target=collector.wait_until,
                args=(work(value),),
            )
            for value in range(10)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        await collector.drain()
        self.assertEqual(sorted(calls), list(range(10)))


class TestWaitUntilContext(unittest.TestCase):
    def test_sync_finish_clears_calling_context(self) -> None:
        from vercel.cache.context import (  # pyright: ignore[reportMissingTypeStubs]
            get_context,
        )

        collector = begin_wait_until()
        self.assertIsNotNone(get_context().wait_until)

        finish_wait_until(collector)

        callback = get_context().wait_until
        if callback is not None:

            async def work() -> None:
                await asyncio.sleep(0)

            coroutine = work()
            callback(coroutine)
            coroutine.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
