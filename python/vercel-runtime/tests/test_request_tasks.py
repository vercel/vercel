from __future__ import annotations

import asyncio
import threading
import unittest
from contextvars import ContextVar
from unittest.mock import patch

from vercel_runtime.request_tasks import (
    _reset_request_tasks,
    register_request_task,
    run_request_tasks,
    run_request_tasks_async,
)


class TestRequestTasks(unittest.TestCase):
    def setUp(self) -> None:
        _reset_request_tasks()

    def tearDown(self) -> None:
        _reset_request_tasks()

    def test_one_shot_task_runs_once(self) -> None:
        calls: list[str] = []
        register_request_task("activate", lambda: calls.append("called"))

        run_request_tasks()
        run_request_tasks()

        self.assertEqual(calls, ["called"])

    def test_repeated_registration_is_idempotent(self) -> None:
        calls: list[str] = []
        register_request_task("activate", lambda: calls.append("first"))
        register_request_task("activate", lambda: calls.append("second"))

        run_request_tasks()

        self.assertEqual(calls, ["first"])

    def test_interval_task_only_runs_when_due(self) -> None:
        calls: list[str] = []
        with patch(
            "vercel_runtime.request_tasks.time.monotonic",
            side_effect=[100.0, 100.0, 100.0, 159.0, 160.0, 160.0],
        ):
            register_request_task(
                "activity",
                lambda: calls.append("called"),
                min_interval_seconds=60,
            )
            run_request_tasks()
            run_request_tasks()
            run_request_tasks()
            run_request_tasks()

        self.assertEqual(calls, ["called", "called"])

    def test_failed_task_retries_on_next_request(self) -> None:
        attempts = 0

        def callback() -> None:
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                msg = "try again"
                raise RuntimeError(msg)

        with self.assertLogs(
            "vercel_runtime.request_tasks",
            level="ERROR",
        ):
            register_request_task("retry", callback)
            run_request_tasks()

        run_request_tasks()
        self.assertEqual(attempts, 2)

    def test_concurrent_requests_do_not_run_same_task_twice(self) -> None:
        entered = threading.Event()
        release = threading.Event()
        calls = 0

        def callback() -> None:
            nonlocal calls
            calls += 1
            entered.set()
            release.wait(timeout=5)

        register_request_task("once", callback)
        first = threading.Thread(target=run_request_tasks)
        first.start()
        self.assertTrue(entered.wait(timeout=1))

        second = threading.Thread(target=run_request_tasks)
        second.start()
        second.join(timeout=0.05)
        self.assertTrue(second.is_alive())

        release.set()
        first.join(timeout=1)
        second.join(timeout=1)

        self.assertEqual(calls, 1)
        self.assertFalse(first.is_alive())
        self.assertFalse(second.is_alive())

    def test_callback_runs_off_thread_with_request_context(self) -> None:
        request_value: ContextVar[str] = ContextVar("request_value")
        request_value.set("oidc-context")
        caller_thread = threading.get_ident()
        observed: list[tuple[int, str]] = []

        register_request_task(
            "context",
            lambda: observed.append(
                (threading.get_ident(), request_value.get()),
            ),
        )
        run_request_tasks()

        self.assertEqual(observed[0][1], "oidc-context")
        self.assertNotEqual(observed[0][0], caller_thread)

    def test_async_runner_does_not_block_event_loop(self) -> None:
        entered = threading.Event()
        release = threading.Event()

        def callback() -> None:
            entered.set()
            release.wait(timeout=5)

        async def scenario() -> None:
            register_request_task("async", callback)
            task = asyncio.create_task(run_request_tasks_async())
            self.assertTrue(await asyncio.to_thread(entered.wait, 1))

            await asyncio.sleep(0)
            self.assertFalse(task.done())

            release.set()
            await task

        asyncio.run(scenario())

    def test_rejects_invalid_registration(self) -> None:
        with self.assertRaisesRegex(ValueError, "name"):
            register_request_task("", lambda: None)
        with self.assertRaisesRegex(ValueError, "greater than zero"):
            register_request_task(
                "invalid",
                lambda: None,
                min_interval_seconds=0,
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
