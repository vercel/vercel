from __future__ import annotations

import asyncio
import unittest
from datetime import UTC, datetime

from vercel_runtime import deadline, get_deadline


class TestDeadline(unittest.IsolatedAsyncioTestCase):
    def test_valid_deadline_is_returned_in_utc(self) -> None:
        token = deadline.set_deadline("2026-08-18T12:30:45.123+02:00")
        try:
            self.assertEqual(
                get_deadline(),
                datetime(2026, 8, 18, 10, 30, 45, 123000, UTC),
            )
        finally:
            deadline.reset_deadline(token)

    def test_missing_or_malformed_deadline_returns_none(self) -> None:
        for value in (
            None,
            "not-a-date",
            "2026-08-18T12:30:45",
            "20260818T123045Z",
        ):
            with self.subTest(value=value):
                token = deadline.set_deadline(value)
                try:
                    self.assertIsNone(get_deadline())
                finally:
                    deadline.reset_deadline(token)

    def test_submillisecond_precision_matches_node(self) -> None:
        token = deadline.set_deadline("2026-08-18T12:30:45.123456789Z")
        try:
            observed = get_deadline()
            self.assertIsNotNone(observed)
            assert observed is not None
            self.assertEqual(observed.microsecond, 123000)
        finally:
            deadline.reset_deadline(token)

    async def test_concurrent_contexts_are_isolated(self) -> None:
        started = asyncio.Event()

        async def observe(value: str, delay: float) -> datetime | None:
            token = deadline.set_deadline(value)
            try:
                if delay:
                    started.set()
                    await asyncio.sleep(delay)
                else:
                    await started.wait()
                return get_deadline()
            finally:
                deadline.reset_deadline(token)

        first, second = await asyncio.gather(
            observe("2026-08-18T10:00:00Z", 0.01),
            observe("2026-08-18T11:00:00Z", 0),
        )

        self.assertEqual(first, datetime(2026, 8, 18, 10, tzinfo=UTC))
        self.assertEqual(second, datetime(2026, 8, 18, 11, tzinfo=UTC))
